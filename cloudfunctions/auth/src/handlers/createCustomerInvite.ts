/**
 * createCustomerInvite：店主生成 6 位顾客邀请码（ADR-0010/0013）。
 * 入参：无（需已激活店主身份）
 * 顾客邀请码长期有效（不像店员邀请码 10 分钟 TTL），
 * 唯一性靠 rebate_codes.code 唯一索引 + 重试。
 * 绑定由顾客扫码后调 registerCustomer 完成。
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
import { audit, getCtx } from '../helpers';
import type { Customer } from '../shared/types';

const MAX_GENERATE_ATTEMPTS = 5;

export async function createCustomerInvite() {
  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '无 openid');

  const owner = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!owner || owner.role !== 'owner' || owner.activationStatus !== 'active') {
    return fail(AUTH_ERRORS.FORBIDDEN, '仅已激活的店主可生成顾客邀请码');
  }

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
  const inviteId = await addOne(COLLECTIONS.REBATE_CODES, {
    code,
    inviterId: owner._id,
    status: 'active',
    createdAt: now
  });
  await audit(owner._id, 'owner', 'customer_invite_created', 'rebate_code', inviteId, { code });

  // 顺手取一下店主已生成未使用的邀请码数量，方便店主判断「还需不需要再生成」
  const unusedCount = await countWhere(COLLECTIONS.REBATE_CODES, {
    inviterId: owner._id,
    status: 'active'
  });
  return ok({ code, unusedCount });
}
