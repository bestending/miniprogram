/**
 * createStaffInvite：店主生成 6 位店员邀请码（ADR-0013）。
 * 入参：无（需已激活店主身份）
 * 10 分钟 TTL；码字符集排除易混淆 0/O/I/1；唯一性靠 staff_invitations.code 唯一索引 + 重试。
 */

import { ok, fail } from '../shared/result';
import {
  COLLECTIONS,
  STAFF_INVITE_CODE_LENGTH,
  STAFF_INVITE_CODE_CHARS,
  STAFF_INVITE_TTL_MINUTES
} from '../shared/constants';
import { AUTH_ERRORS } from '../shared/errors';
import { generateCode } from '../shared/crypto';
import { findOne, countWhere, addOne } from '../shared/query';
import { audit, getCtx } from '../helpers';
import type { Customer } from '../shared/types';

const MS_PER_MINUTE = 60 * 1000;

export async function createStaffInvite() {
  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '无 openid');

  const owner = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!owner || owner.role !== 'owner' || owner.activationStatus !== 'active') {
    return fail(AUTH_ERRORS.FORBIDDEN, '仅已激活的店主可生成店员邀请码');
  }

  const now = Date.now();
  const expiresAt = now + STAFF_INVITE_TTL_MINUTES * MS_PER_MINUTE;

  // 随机码格式合法即可，唯一性靠 staff_invitations.code 唯一索引兜底，这里做轻量去重重试
  let code = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateCode(STAFF_INVITE_CODE_LENGTH, STAFF_INVITE_CODE_CHARS);
    const total = await countWhere(COLLECTIONS.STAFF_INVITATIONS, { code: candidate });
    if (total === 0) {
      code = candidate;
      break;
    }
  }
  if (!code) return fail(AUTH_ERRORS.INTERNAL_ERROR, '邀请码生成失败，请重试');

  const inviteId = await addOne(COLLECTIONS.STAFF_INVITATIONS, {
    code,
    createdBy: owner._id,
    status: 'unused',
    expiresAt,
    createdAt: now
  });
  await audit(owner._id, 'owner', 'staff_invite_created', 'staff_invitation', inviteId, { code, expiresAt });
  return ok({ code, expiresAt });
}
