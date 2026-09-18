import { ok, fail } from './shared/result';
import { cloud } from './shared/db';

interface TimerEvent {
  TriggerName?: string;
  Message?: string;
  [key: string]: unknown;
}

/**
 * 定时任务集合（5 个触发器，按 TriggerName 路由）（ADR-0015）。
 * 触发器与 cron 见同目录 config.json（cron 为 UTC，已换算北京时间）。
 */
const routes: Record<string, (event: TimerEvent) => Promise<Record<string, unknown>>> = {
  'rebate-credit-tick': creditT7,
  'expiring-soon-tick': notifyExpiring,
  'monthly-window-tick': windowMonthlyPre,
  'monthly-aggregate-tick': aggregateMonthly,
  'top10-refresh-tick': refreshTop10Cache
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

async function creditT7(): Promise<Record<string, unknown>> {
  // 调用 rebate 云函数的 releasePendingRebates，将满 T+7 的待定订单转入余额
  const res = (await cloud.callFunction({
    name: 'rebate',
    data: { action: 'releasePendingRebates' }
  })) as unknown as { result?: { ok?: boolean; data?: Record<string, unknown>; message?: string } };
  if (res.result?.ok) return res.result.data ?? {};
  return { error: res.result?.message || 'releasePendingRebates failed' };
}

async function notifyExpiring(): Promise<Record<string, unknown>> {
  // TODO: 余额 90 天到期前 7 天预警
  return { todo: '余额 90 天到期前 7 天预警' };
}

async function windowMonthlyPre(): Promise<Record<string, unknown>> {
  // TODO: 写入次日「月度返利日」rebate_windows 记录
  return { todo: '写入次日「月度返利日」rebate_windows 记录' };
}

async function aggregateMonthly(): Promise<Record<string, unknown>> {
  // TODO: 按 inviterId 聚合上月 -> monthly_aggregates / top10_cache
  return { todo: '按 inviterId 聚合上月 -> monthly_aggregates / top10_cache' };
}

async function refreshTop10Cache(): Promise<Record<string, unknown>> {
  // TODO: 刷新管理端首页 TOP10 缓存
  return { todo: '刷新管理端首页 TOP10 缓存' };
}
