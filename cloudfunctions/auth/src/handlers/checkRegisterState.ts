/**
 * checkRegisterState：顾客注册前置查询（ADR-0013）。
 * 入参：{ inviteCode?: string }（可选，用于预校验邀请码有效性）
 * 返回：{ registered: true, session } | { registered: false, inviteCodeValid, inviterId? }
 */

import { ok, fail } from '../shared/result';
import { COLLECTIONS, INVITE_CODE_LENGTH } from '../shared/constants';
import { AUTH_ERRORS } from '../shared/errors';
import { findOne } from '../shared/query';
import { toSession, getCtx, type AuthEvent } from '../helpers';
import type { Customer, RebateCode } from '../shared/types';

export async function checkRegisterState(event: AuthEvent) {
  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '无 openid');

  const customer = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (customer) {
    return ok({ registered: true, session: toSession(customer) });
  }

  let inviteCodeValid = false;
  let inviterId: string | undefined;
  const inviteCode = event.inviteCode;
  if (typeof inviteCode === 'string' && inviteCode.length === INVITE_CODE_LENGTH) {
    const codeDoc = await findOne<RebateCode & { _id: string }>(COLLECTIONS.REBATE_CODES, {
      code: inviteCode,
      status: 'active'
    });
    if (codeDoc && !codeDoc.newbieId) {
      inviteCodeValid = true;
      inviterId = codeDoc.inviterId;
    }
  }
  return ok({ registered: false, inviteCodeValid, inviterId });
}
