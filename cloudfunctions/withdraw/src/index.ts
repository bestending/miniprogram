import { fail } from './shared/result';
import { AUTH_ERRORS } from './shared/errors';
import { listWithdrawRequests } from './handlers/listWithdrawRequests';
import type { ListWithdrawRequestsEvent } from './handlers/listWithdrawRequests';
import { reviewWithdraw } from './handlers/reviewWithdraw';
import type { ReviewWithdrawEvent } from './handlers/reviewWithdraw';
import type { WithdrawEvent } from './helpers';

/**
 * 提现审核（ADR-0005）。
 * 申请走 rebate.applyWithdraw；本函数负责店主审核（通过/拒绝）。
 * 企业付款打款（pay）需商户号 API，暂留 TODO，approve 后置为 approved 待人工打款。
 */
export async function main(event: WithdrawEvent) {
  if (!event.action) {
    return fail(AUTH_ERRORS.MISSING_ACTION, '云函数调用缺少 action 字段');
  }

  try {
    switch (event.action) {
      case 'listWithdrawRequests':
        return await listWithdrawRequests(event as ListWithdrawRequestsEvent);
      case 'reviewWithdraw':
        return await reviewWithdraw(event as ReviewWithdrawEvent);
      default:
        return fail(AUTH_ERRORS.UNKNOWN_ACTION, `未知 action: ${event.action}`);
    }
  } catch (e) {
    console.error('[withdraw] uncaught', e);
    return fail(AUTH_ERRORS.INTERNAL_ERROR, '服务异常，请稍后重试');
  }
}
