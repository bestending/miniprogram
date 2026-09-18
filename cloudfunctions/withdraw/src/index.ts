import { ok, fail } from './shared/result';

interface CallEvent {
  action?: string;
  [key: string]: unknown;
}

/**
 * 余额提现（人工审核 + 商户号企业付款到微信零钱）（ADR-0005）。
 * 调用方通过 wx.cloud.callFunction({ data: { action, ...payload } }) 路由。
 */
export async function main(event: CallEvent) {
  if (!event.action) {
    return fail('missing_action', '云函数调用缺少 action 字段');
  }

  switch (event.action) {
      case 'apply':
        // TODO: 提现申请：余额 ≥150 元、月累计 ≤100 元
        return ok({ function: 'withdraw', action: event.action });
      case 'review':
        // TODO: 店主审核（通过/拒绝，店员无权限）
        return ok({ function: 'withdraw', action: event.action });
      case 'pay':
        // TODO: 企业付款打款并回写 wxTransferId，失败回退审核状态
        return ok({ function: 'withdraw', action: event.action });
    default:
      return fail('unknown_action', `未知 action: ${event.action}`);
  }
}
