import { ok, fail } from './shared/result';

interface CallEvent {
  action?: string;
  [key: string]: unknown;
}

/**
 * 邀请码生成/绑定/核销与返利计算（ADR-0001~0004）。
 * 调用方通过 wx.cloud.callFunction({ data: { action, ...payload } }) 路由。
 */
export async function main(event: CallEvent) {
  if (!event.action) {
    return fail('missing_action', '云函数调用缺少 action 字段');
  }

  switch (event.action) {
      case 'issueCode':
        // TODO: 为首单用户生成 6 位邀请码（反作弊：首单领码）
        return ok({ function: 'rebate', action: event.action });
      case 'bindCode':
        // TODO: 被邀请人绑定邀请码（一次绑定 + 同设备/IP/手机号硬互斥）
        return ok({ function: 'rebate', action: event.action });
      case 'verifyOrder':
        // TODO: 到店核销，按返利窗口（节假日优先、其次月15日）锁定返利金额
        return ok({ function: 'rebate', action: event.action });
    default:
      return fail('unknown_action', `未知 action: ${event.action}`);
  }
}
