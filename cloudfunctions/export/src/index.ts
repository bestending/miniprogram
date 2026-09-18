import { ok, fail } from './shared/result';
import { importMeituanOrders } from './handlers/importOrders';
import type { ImportMeituanOrdersEvent } from './handlers/importOrders';

interface CallEvent {
  action?: string;
  [key: string]: unknown;
}

/**
 * 导入/导出云函数（ADR-0008）。
 * 调用方通过 wx.cloud.callFunction({ data: { action, ...payload } }) 路由。
 */
export async function main(event: CallEvent) {
  if (!event.action) {
    return fail('missing_action', '云函数调用缺少 action 字段');
  }

  switch (event.action) {
    case 'importMeituanOrders':
      return await importMeituanOrders(event as ImportMeituanOrdersEvent);
    case 'exportCsv':
      // TODO: 按日/周/月导出并写审计日志
      return ok({ function: 'export', action: event.action });
    default:
      return fail('unknown_action', `未知 action: ${event.action}`);
  }
}
