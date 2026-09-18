/**
 * getMyInviteCode：顾客获取自己的 6 位邀请码（ADR-0010/0013）。
 * 入参：无（需已注册顾客身份）
 * 该顾客首次访问邀请页时懒生成 rebate_codes 文档（inviterId = 自己 customerId），
 * 后续访问直接返回同一条。每个顾客只对应一个长期邀请码。
 */

import { ok, fail } from '../shared/result';
import {
  COLLECTIONS,
  INVITE_CODE_LENGTH,
  STAFF_INVITE_CODE_CHARS
} from '../shared/constants';
import { AUTH_ERRORS } from '../shared/errors';
import { generateCode } from '../shared/crypto';
import { findOne, countWhere, addOne } from '../shared/query';
import { getCtx } from '../helpers';
import type { Customer, RebateCode } from '../shared/types';

const MAX_GENERATE_ATTEMPTS = 5;

export async function getMyInviteCode() {
  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '无 openid');

  const customer = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!customer) return fail(AUTH_ERRORS.UNAUTHORIZED, '请先注册');
  // 店主/店员也可查看自己的邀请码（统一逻辑）
  // role 是 customer/clerk/owner 都允许

  // 已有 active 邀请码则直接返回（首条，按 createdAt 升序）
  const existing = await findOne<RebateCode & { _id: string }>(COLLECTIONS.REBATE_CODES, {
    inviterId: customer._id,
    status: 'active'
  });
  if (existing) {
    return ok({
      code: existing.code,
      createdAt: existing.createdAt,
      isNew: false
    });
  }

  // 懒生成新码
  let code = '';
  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt += 1) {
    const candidate = generateCode(INVITE_CODE_LENGTH, STAFF_INVITE_CODE_CHARS);
    const total = await countWhere(COLLECTIONS.REBATE_CODES, { code: candidate });
    if (total === 0) {
      code = candidate;
      break;
    }
  }
  if (!code) return fail(AUTH_ERRORS.INTERNAL_ERROR, '邀请码生成失败，请重试');

  const now = Date.now();
  await addOne(COLLECTIONS.REBATE_CODES, {
    code,
    inviterId: customer._id,
    status: 'active',
    createdAt: now
  });

  return ok({ code, createdAt: now, isNew: true });
}
