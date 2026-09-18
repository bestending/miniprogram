import { ok, fail } from './shared/result';

interface TimerEvent {
  TriggerName?: string;
  Message?: string;
  [key: string]: unknown;
}

/**
 * 日终自动对账（orders / rebate_balances / withdraw_requests 三源）（ADR-0015）。
 * 触发器与 cron 见同目录 config.json（cron 为 UTC，已换算北京时间）。
 */
const routes: Record<string, (event: TimerEvent) => Promise<Record<string, unknown>>> = {
  'reconcile-tick': reconcileDaily
};

export async function main(event: TimerEvent) {
  const triggerName = event.TriggerName;
  if (!triggerName) {
    return fail('missing_trigger', '缺少 TriggerName，该函数仅由定时触发器调用');
  }
  const handler = routes[triggerName];
  if (!handler) {
    return fail('unknown_trigger', `未知定时触发器: ${triggerName}`);
  }
  const data = await handler(event);
  return ok({ trigger: triggerName, data });
}

async function reconcileDaily(): Promise<Record<string, unknown>> {
  // TODO: 差异阈值 ¥1：写 audit_logs + 推送店主，不自动修复
  return { todo: '差异阈值 ¥1：写 audit_logs + 推送店主，不自动修复' };
}
