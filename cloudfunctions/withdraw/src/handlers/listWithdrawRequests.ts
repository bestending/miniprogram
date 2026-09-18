/**
 * 列出提现申请（店主/店员查看，ADR-0005）。
 * 可按状态过滤，默认列出待审核。
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import { COLLECTIONS } from '../shared/constants';
import { findOne, findMany } from '../shared/query';
import { getCtx } from '../helpers';
import type { Customer, WithdrawRequest } from '../shared/types';

export interface ListWithdrawRequestsEvent {
  action: 'listWithdrawRequests';
  status?: string;
  limit?: number;
}

const ROLE_LABEL: Record<string, string> = {
  owner: '店主',
  clerk: '店员',
  customer: '顾客'
};

export async function listWithdrawRequests(event: ListWithdrawRequestsEvent) {
  const status = event.status ? String(event.status) : 'pending';
  const limit = Math.min(Math.max(Number(event.limit ?? 100), 1), 500);

  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '未登录');
  const caller = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!caller) return fail(AUTH_ERRORS.UNAUTHORIZED, '调用者未注册');
  if (caller.role === 'customer') return fail(AUTH_ERRORS.FORBIDDEN, '顾客不能查看提现列表');
  if (caller.role === 'owner' && caller.activationStatus !== 'active') {
    return fail(AUTH_ERRORS.FORBIDDEN, '店主未激活');
  }

  const where: Record<string, unknown> = {};
  if (status !== 'all') where.status = status;

  const requests = await findMany<WithdrawRequest>(COLLECTIONS.WITHDRAW_REQUESTS, where);
  requests.sort((a, b) => b.submittedAt - a.submittedAt);
  const sliced = requests.slice(0, limit);

  // 批量查顾客编号
  const customerIds = [...new Set(sliced.map((r) => r.customerId))];
  const customerMap = new Map<string, Customer>();
  for (const cid of customerIds) {
    const c = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { _id: cid });
    if (c) customerMap.set(cid, c);
  }

  const rows = sliced.map((r) => {
    const c = customerMap.get(r.customerId);
    return {
      requestId: r._id,
      customerId: r.customerId,
      customerCode: c?.customerCode ?? '',
      customerRole: c ? ROLE_LABEL[c.role] : r.customerId.slice(-4),
      amount: r.amount,
      status: r.status,
      monthUsed: r.monthUsed,
      submittedAt: r.submittedAt,
      reviewedAt: r.reviewedAt ?? null,
      rejectReason: r.rejectReason ?? ''
    };
  });

  return ok({ requests: rows, total: requests.length });
}
