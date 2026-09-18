/**
 * 店主审核提现申请（ADR-0005）。
 * 仅 owner 可操作。
 *   - approve: status → approved（待打款）；冻结金额不变，打款后由 pay action 置 paid
 *   - reject:  status → rejected，frozen 退回 available
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import { COLLECTIONS } from '../shared/constants';
import { findOne, updateDoc } from '../shared/query';
import { command } from '../shared/query';
import { getCtx, audit } from '../helpers';
import type { Customer, WithdrawRequest, RebateBalance } from '../shared/types';

export interface ReviewWithdrawEvent {
  action: 'reviewWithdraw';
  requestId?: string;
  decision?: 'approve' | 'reject';
  rejectReason?: string;
}

export async function reviewWithdraw(event: ReviewWithdrawEvent) {
  const requestId = String(event.requestId ?? '').trim();
  const decision = event.decision;
  if (!requestId) return fail(AUTH_ERRORS.MISSING_PARAM, 'requestId 不能为空');
  if (decision !== 'approve' && decision !== 'reject') {
    return fail(AUTH_ERRORS.MISSING_PARAM, 'decision 需为 approve 或 reject');
  }

  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '未登录');
  const caller = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!caller) return fail(AUTH_ERRORS.UNAUTHORIZED, '调用者未注册');
  // 仅店主可审核提现
  if (caller.role !== 'owner') return fail(AUTH_ERRORS.FORBIDDEN, '仅店主可审核提现');
  if (caller.activationStatus !== 'active') return fail(AUTH_ERRORS.FORBIDDEN, '店主未激活');

  const req = await findOne<WithdrawRequest>(COLLECTIONS.WITHDRAW_REQUESTS, { _id: requestId });
  if (!req) return fail('request_not_found', '提现申请不存在');
  if (req.status !== 'pending') return fail('request_not_pending', '该申请已处理');

  const now = Date.now();

  if (decision === 'reject') {
    // 冻结金额退回可用余额
    const balance = await findOne<RebateBalance>(COLLECTIONS.REBATE_BALANCES, {
      customerId: req.customerId
    });
    if (balance) {
      await updateDoc(COLLECTIONS.REBATE_BALANCES, balance._id, {
        frozen: command.inc(-req.amount),
        available: command.inc(req.amount),
        updatedAt: now
      });
    }
    await updateDoc(COLLECTIONS.WITHDRAW_REQUESTS, req._id, {
      status: 'rejected',
      reviewedAt: now,
      reviewedBy: caller._id,
      rejectReason: event.rejectReason || '店主拒绝'
    });
    await audit(caller._id, 'owner', 'reject_withdraw', 'withdraw_request', req._id, {
      amount: req.amount,
      rejectReason: event.rejectReason
    });
    return ok({ requestId, status: 'rejected' });
  }

  // approve → approved（待打款）
  await updateDoc(COLLECTIONS.WITHDRAW_REQUESTS, req._id, {
    status: 'approved',
    reviewedAt: now,
    reviewedBy: caller._id
  });
  await audit(caller._id, 'owner', 'approve_withdraw', 'withdraw_request', req._id, {
    amount: req.amount
  });
  return ok({ requestId, status: 'approved' });
}
