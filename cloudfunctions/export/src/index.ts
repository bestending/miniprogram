import { ok, fail } from './shared/result';

interface CallEvent {
  action?: string;
  [key: string]: unknown;
}

/**
 * CSV 导出（订单/返利/提现明细，中文表头，UTF-8 with BOM）（ADR-0008）。
 * 调用方通过 wx.cloud.callFunction({ data: { action, ...payload } }) 路由。
 */
export async function main(event: CallEvent) {
  if (!event.action) {
    return fail('missing_action', '云函数调用缺少 action 字段');
  }

  switch (event.action) {
      case 'exportCsv':
        // TODO: 按日/周/月导出并写审计日志
        return ok({ function: 'export', action: event.action });
    default:
      return fail('unknown_action', `未知 action: ${event.action}`);
  }
}
