/**
 * 查询指定顾客的返利余额（店主/店员后台用）。
 * 顾客端自查走 auth.getMyBalance（ADR-0016，需手机号+短码）。
 *
 * 触发者：owner / clerk。
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import { COLLECTIONS } from '../shared/constants';
import { findOne } from '../shared/query';
import { getCtx } from '../helpers';
import type { Customer, RebateBalance } from '../shared/types';

export interface GetBalanceEvent {
  action: 'getBalance';
  customerId?: string;
}

export async function getBalance(event: GetBalanceEvent) {
  const customerId = String(event.customerId ?? '').trim();
  if (!customerId) return fail(AUTH_ERRORS.MISSING_PARAM, 'customerId 不能为空');

  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '未登录');
  const caller = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!caller) return fail(AUTH_ERRORS.UNAUTHORIZED, '调用者未注册');
  if (caller.role === 'customer') return fail(AUTH_ERRORS.FORBIDDEN, '顾客不能查看他人余额');
  if (caller.role === 'owner' && caller.activationStatus !== 'active') {
    return fail(AUTH_ERRORS.FORBIDDEN, '店主未激活');
  }

  const customer = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { _id: customerId });
  if (!customer) return fail(AUTH_ERRORS.CUSTOMER_NOT_FOUND, '顾客不存在');

  const balance = await findOne<RebateBalance>(COLLECTIONS.REBATE_BALANCES, { customerId });

  return ok({
    customerId,
    available: balance?.available ?? 0,
    pending: balance?.pending ?? 0,
    frozen: balance?.frozen ?? 0,
    totalConsumption: balance ? balance.available + balance.pending + balance.frozen : 0,
    updatedAt: balance?.updatedAt ?? null
  });
}
