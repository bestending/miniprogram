import { ok, fail } from './shared/result';

interface CallEvent {
  action?: string;
  [key: string]: unknown;
}

/**
 * 店主一次性激活码激活、店员邀请码绑定、顾客 OpenID+手机号 注册（ADR-0013）。
 * 调用方通过 wx.cloud.callFunction({ data: { action, ...payload } }) 路由。
 */
export async function main(event: CallEvent) {
  if (!event.action) {
    return fail('missing_action', '云函数调用缺少 action 字段');
  }

  switch (event.action) {
      case 'ownerActivate':
        // TODO: 店主白名单校验 + 8 位一次性激活码激活（失败 3 次锁 24h）
        return ok({ function: 'auth', action: event.action });
      case 'bindClerk':
        // TODO: 店员输入店主生成的 6 位邀请码（10 分钟有效，50 次/天/IP）
        return ok({ function: 'auth', action: event.action });
      case 'registerCustomer':
        // TODO: 顾客注册：手机号云调用解密 -> phoneHash -> 邀请码一次绑定
        return ok({ function: 'auth', action: event.action });
    default:
      return fail('unknown_action', `未知 action: ${event.action}`);
  }
}
