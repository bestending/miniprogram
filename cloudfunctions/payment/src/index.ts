import { ok, fail } from './shared/result';

interface CallEvent {
  action?: string;
  [key: string]: unknown;
}

/**
 * 微信支付 v3：下单、退款、支付/退款回调（ADR-0002）。
 * 调用方通过 wx.cloud.callFunction({ data: { action, ...payload } }) 路由。
 */
export async function main(event: CallEvent) {
  if (!event.action) {
    return fail('missing_action', '云函数调用缺少 action 字段');
  }

  switch (event.action) {
      case 'createOrder':
        // TODO: 下单支付
        return ok({ function: 'payment', action: event.action });
      case 'refund':
        // TODO: 全额/部分退款，触发返利按比例扣回
        return ok({ function: 'payment', action: event.action });
      case 'payCallback':
        // TODO: 支付/退款状态回调推进订单状态机
        return ok({ function: 'payment', action: event.action });
    default:
      return fail('unknown_action', `未知 action: ${event.action}`);
  }
}
