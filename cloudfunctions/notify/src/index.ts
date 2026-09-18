import { ok, fail } from './shared/result';

interface CallEvent {
  action?: string;
  [key: string]: unknown;
}

/**
 * 微信订阅消息 + 站内消息中心，含每日推送上限（ADR-0014）。
 * 调用方通过 wx.cloud.callFunction({ data: { action, ...payload } }) 路由。
 */
export async function main(event: CallEvent) {
  if (!event.action) {
    return fail('missing_action', '云函数调用缺少 action 字段');
  }

  switch (event.action) {
      case 'sendEvent':
        // TODO: 按 NOTIFICATION_EVENTS 分发；订阅失败 43101/40037 降级站内
        return ok({ function: 'notify', action: event.action });
      case 'markRead':
        // TODO: 站内消息标记已读
        return ok({ function: 'notify', action: event.action });
    default:
      return fail('unknown_action', `未知 action: ${event.action}`);
  }
}
