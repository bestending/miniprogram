/**
 * 顾客申请提现（ADR-0005）。
 * 触发者：顾客（手机号+顾客短码校验）。
 *
 * 规则：
 *   - 可用余额 ≥ 150 元才可申请
 *   - 每月提现上限 100 元（含已申请未结清的）
 *   - 申请金额从 available 转入 frozen，待店主审核
 *   - amount 不传时取最大可提额度
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import {
  COLLECTIONS,
  WITHDRAW_THRESHOLD_YUAN,
  WITHDRAW_MONTHLY_LIMIT_YUAN
} from '../shared/constants';
import { findOne, findMany, addOne, updateDoc } from '../shared/query';
import { command } from '../shared/query';
import { hashPhone } from '../shared/crypto';
import { getGlobalSalt, audit, beijingMonthStart } from '../helpers';
import type { Customer, RebateBalance, WithdrawRequest } from '../shared/types';

export interface ApplyWithdrawEvent {
  action: 'applyWithdraw';
  phone?: string;
  customerCode?: string;
  amount?: number;
}

const PHONE_REGEX = /^1[3-9]\d{9}$/;
const ACTIVE_STATUSES: WithdrawRequest['status'][] = ['pending', 'approved', 'paid'];

export async function applyWithdraw(event: ApplyWithdrawEvent) {
  const phone = String(event.phone ?? '').trim();
  const customerCode = String(event.customerCode ?? '').trim();
  const requestedAmount = event.amount ? Math.floor(Number(event.amount)) : undefined;

  if (!PHONE_REGEX.test(phone)) return fail(AUTH_ERRORS.INVALID_PHONE_FORMAT, '手机号格式错误');
  if (!/^\d{4}$/.test(customerCode)) return fail(AUTH_ERRORS.CUSTOMER_CREDENTIAL_INVALID, '顾客编号应为 4 位数字');

  const salt = getGlobalSalt();
  const phoneHash = hashPhone(phone, salt);
  const customer = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { phoneHash, customerCode });
  if (!customer || customer.role !== 'customer') {
    return fail(AUTH_ERRORS.CUSTOMER_CREDENTIAL_INVALID, '手机号或顾客编号错误');
  }

  const balance = await findOne<RebateBalance>(COLLECTIONS.REBATE_BALANCES, { customerId: customer._id });
  const available = balance?.available ?? 0;

  if (available < WITHDRAW_THRESHOLD_YUAN * 100) {
    return fail('below_threshold', `可用余额需满 ${WITHDRAW_THRESHOLD_YUAN} 元才可提现`);
  }

  // 当月已用提现额度
  const monthStart = beijingMonthStart(Date.now());
  const monthRequests = await findMany<WithdrawRequest>(COLLECTIONS.WITHDRAW_REQUESTS, {
    customerId: customer._id
  });
  const monthUsed = monthRequests
    .filter((r) => ACTIVE_STATUSES.includes(r.status) && r.submittedAt >= monthStart)
    .reduce((s, r) => s + r.amount, 0);

  const monthlyLimit = WITHDRAW_MONTHLY_LIMIT_YUAN * 100;
  const maxWithdrawable = Math.min(available, Math.max(0, monthlyLimit - monthUsed));

  if (maxWithdrawable <= 0) {
    return fail('monthly_limit_reached', `本月提现额度已用完（${WITHDRAW_MONTHLY_LIMIT_YUAN} 元/月）`);
  }

  const amount =
    requestedAmount !== undefined
      ? Math.min(requestedAmount, maxWithdrawable)
      : maxWithdrawable;
  if (amount <= 0) return fail('invalid_amount', '提现金额无效');

  // available → frozen
  if (balance) {
    await updateDoc(COLLECTIONS.REBATE_BALANCES, balance._id, {
      available: command.inc(-amount),
      frozen: command.inc(amount),
      updatedAt: Date.now()
    });
  }

  const requestId = await addOne(COLLECTIONS.WITHDRAW_REQUESTS, {
    customerId: customer._id,
    amount,
    status: 'pending',
    monthUsed,
    submittedAt: Date.now()
  });

  await audit(customer._id, 'customer', 'apply_withdraw', 'withdraw_request', requestId, { amount });

  return ok({ requestId, amount, monthUsed, remainingMonthly: monthlyLimit - monthUsed - amount });
}
