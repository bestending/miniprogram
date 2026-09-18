/**
 * bindClerk：店员输入 6 位邀请码绑定（ADR-0013）。
 * 入参：{ code: string }
 * - 10 分钟 TTL，过期置 expired
 * - 50 次/天/身份 限频（ADR 原文口径为 IP，但 wx.cloud.callFunction 不暴露客户端 IP，
 *   getWXContext 仅返回 openid，故按 openid 等价限频；审计日志 targetType='rate_limit' 计数）
 * - 已是店主/店员的微信号互斥拒绝
 */

import { ok, fail } from '../shared/result';
import { COLLECTIONS, STAFF_INVITE_CODE_LENGTH, STAFF_INVITE_MAX_PER_DAY_PER_IP } from '../shared/constants';
import { AUTH_ERRORS } from '../shared/errors';
import { findOne, countWhere, addOne, updateDoc, command } from '../shared/query';
import { toSession, audit, getCtx, beijingTodayStart, type AuthEvent } from '../helpers';
import type { Customer, StaffInvitation } from '../shared/types';

export async function bindClerk(event: AuthEvent) {
  const code = event.code;
  if (typeof code !== 'string' || code.length !== STAFF_INVITE_CODE_LENGTH) {
    return fail(AUTH_ERRORS.STAFF_INVITE_NOT_FOUND, '邀请码格式不符');
  }

  const { openid, ip } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '无 openid');

  const now = Date.now();

  // 限频：按 openid 计数当日绑定尝试（success + failure 均计）
  const todayStart = beijingTodayStart(now);
  const attempts = await countWhere(COLLECTIONS.AUDIT_LOGS, {
    action: 'staff_bind_attempt',
    targetType: 'rate_limit',
    targetId: openid,
    createdAt: command.gte(todayStart)
  });
  if (attempts >= STAFF_INVITE_MAX_PER_DAY_PER_IP) {
    return fail(
      AUTH_ERRORS.STAFF_INVITE_IP_LIMIT,
      `今日尝试次数已达上限 ${STAFF_INVITE_MAX_PER_DAY_PER_IP} 次，请明日再试`
    );
  }

  // 互斥：已存在 customer 文档则不允许再绑店员
  const existingCustomer = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (existingCustomer) {
    const outcome = existingCustomer.role === 'owner' ? 'already_owner' : 'already_clerk';
    const msg =
      existingCustomer.role === 'owner'
        ? '该微信号已是店主，不可绑定为店员'
        : '该微信号已绑定为店员，无需重复绑定';
    await audit(openid, 'system', 'staff_bind_attempt', 'rate_limit', openid, { outcome, code, ip });
    return fail(AUTH_ERRORS.STAFF_ALREADY_BOUND, msg);
  }

  // 校验邀请码
  const invite = await findOne<StaffInvitation & { _id: string }>(COLLECTIONS.STAFF_INVITATIONS, { code });
  if (!invite) {
    await audit(openid, 'system', 'staff_bind_attempt', 'rate_limit', openid, { outcome: 'not_found', code, ip });
    return fail(AUTH_ERRORS.STAFF_INVITE_NOT_FOUND, '邀请码不存在');
  }
  if (invite.status === 'used') {
    await audit(openid, 'system', 'staff_bind_attempt', 'rate_limit', openid, { outcome: 'used', code, ip });
    return fail(AUTH_ERRORS.STAFF_INVITE_ALREADY_USED, '邀请码已被使用');
  }
  if (invite.expiresAt < now) {
    await updateDoc(COLLECTIONS.STAFF_INVITATIONS, invite._id, { status: 'expired' });
    await audit(openid, 'system', 'staff_bind_attempt', 'rate_limit', openid, { outcome: 'expired', code, ip });
    return fail(AUTH_ERRORS.STAFF_INVITE_EXPIRED, '邀请码已过期，请向店主重新索取');
  }

  // 落库店员
  const clerkId = await addOne(COLLECTIONS.CUSTOMERS, {
    openid,
    role: 'clerk',
    activationStatus: 'active',
    boundIp: ip || undefined,
    createdAt: now
  });
  await updateDoc(COLLECTIONS.STAFF_INVITATIONS, invite._id, { status: 'used', usedBy: clerkId });
  await audit(clerkId, 'clerk', 'clerk_bound', 'staff_invitation', invite._id, { inviteCode: code, ip });
  await audit(openid, 'system', 'staff_bind_attempt', 'rate_limit', openid, { outcome: 'success', code, ip });

  const clerk: Customer = {
    _id: clerkId,
    openid,
    role: 'clerk',
    activationStatus: 'active',
    boundIp: ip || undefined,
    createdAt: now
  };
  return ok({ session: toSession(clerk) });
}
