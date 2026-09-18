import { fail } from './shared/result';
import { AUTH_ERRORS } from './shared/errors';
import { recordOrder } from './handlers/recordOrder';
import type { RecordOrderEvent } from './handlers/recordOrder';
import { getBalance } from './handlers/getBalance';
import type { GetBalanceEvent } from './handlers/getBalance';
import { applyWithdraw } from './handlers/applyWithdraw';
import type { ApplyWithdrawEvent } from './handlers/applyWithdraw';
import { releasePendingRebates } from './handlers/releasePendingRebates';
import type { ReleasePendingRebatesEvent } from './handlers/releasePendingRebates';
import { listWindows, createWindow, updateWindow, deleteWindow } from './handlers/windows';
import type {
  ListWindowsEvent,
  CreateWindowEvent,
  UpdateWindowEvent,
  DeleteWindowEvent
} from './handlers/windows';
import { getRanking } from './handlers/ranking';
import type { GetRankingEvent } from './handlers/ranking';
import type { RebateEvent } from './helpers';

/**
 * 返利与余额云函数（ADR-0001~0005）。
 * 调用方通过 wx.cloud.callFunction({ name: 'rebate', data: { action, ...payload } }) 路由。
 */
export async function main(event: RebateEvent) {
  if (!event.action) {
    return fail(AUTH_ERRORS.MISSING_ACTION, '云函数调用缺少 action 字段');
  }

  try {
    switch (event.action) {
      case 'recordOrder':
        return await recordOrder(event as RecordOrderEvent);
      case 'getBalance':
        return await getBalance(event as GetBalanceEvent);
      case 'applyWithdraw':
        return await applyWithdraw(event as ApplyWithdrawEvent);
      case 'releasePendingRebates':
        return await releasePendingRebates(event as ReleasePendingRebatesEvent);

      // ---- 节假日/活动窗口管理（仅店主）----
      case 'listWindows':
        return await listWindows(event as ListWindowsEvent);
      case 'createWindow':
        return await createWindow(event as CreateWindowEvent);
      case 'updateWindow':
        return await updateWindow(event as UpdateWindowEvent);
      case 'deleteWindow':
        return await deleteWindow(event as DeleteWindowEvent);

      // ---- 月度返利排行 ----
      case 'getRanking':
        return await getRanking(event as GetRankingEvent);
      default:
        return fail(AUTH_ERRORS.UNKNOWN_ACTION, `未知 action: ${event.action}`);
    }
  } catch (e) {
    console.error('[rebate] uncaught', e);
    return fail(AUTH_ERRORS.INTERNAL_ERROR, '服务异常，请稍后重试');
  }
}
