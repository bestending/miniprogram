/**
 * rebate 云函数内部工具（不对外导出为 action）。
 */

import { cloud } from './shared/db';
import { addOne } from './shared/query';
import { COLLECTIONS, GLOBAL_SALT_ENV_KEY } from './shared/constants';
import type { ActorRole } from './shared/types';

/** rebate 云函数统一入参（action 路由 + 任意 payload） */
export interface RebateEvent {
  action?: string;
  [key: string]: unknown;
}

/** 取全局盐（云函数环境变量 GLOBAL_SALT）；缺失则抛错由上层 catch 返回 INTERNAL_ERROR */
export function getGlobalSalt(): string {
  const salt = process.env[GLOBAL_SALT_ENV_KEY];
  if (!salt) throw new Error(`环境变量 ${GLOBAL_SALT_ENV_KEY} 未配置`);
  return salt;
}

/** 写审计日志；失败仅记日志，不阻塞主流程 */
export async function audit(
  actorId: string,
  actorRole: ActorRole,
  action: string,
  targetType: string,
  targetId: string,
  payload?: Record<string, unknown>
): Promise<void> {
  try {
    await addOne(COLLECTIONS.AUDIT_LOGS, {
      actorId,
      actorRole,
      action,
      targetType,
      targetId,
      payload,
      createdAt: Date.now()
    });
  } catch (e) {
    console.error('[audit] write failed', e);
  }
}

/** 北京时间（UTC+8）当天 00:00 对应的 UTC 毫秒时间戳 */
export function beijingTodayStart(now: number): number {
  const beijingOffset = 8 * 3600 * 1000;
  const local = new Date(now + beijingOffset);
  local.setHours(0, 0, 0, 0);
  return local.getTime() - beijingOffset;
}

/** 北京时间当月 1 号 00:00 的 UTC 毫秒时间戳（用于月度限额统计） */
export function beijingMonthStart(now: number): number {
  const beijingOffset = 8 * 3600 * 1000;
  const local = new Date(now + beijingOffset);
  local.setDate(1);
  local.setHours(0, 0, 0, 0);
  return local.getTime() - beijingOffset;
}

/** 判断北京时间是否为当月 15 日（ADR-0004：月度触发日） */
export function isBeijingMonthly15th(now: number): boolean {
  const beijingOffset = 8 * 3600 * 1000;
  const local = new Date(now + beijingOffset);
  return local.getDate() === 15;
}

/** 统一取 wxContext 的关键字段 */
export function getCtx(): { openid: string; unionid: string; ip: string } {
  const ctx = cloud.getWXContext() as { OPENID?: string; UNIONID?: string; IP?: string };
  return {
    openid: ctx.OPENID ?? '',
    unionid: ctx.UNIONID ?? '',
    ip: ctx.IP ?? ''
  };
}

/** 手机号脱敏 138****1234 */
export function maskPhone(phone: string): string {
  return phone.length === 11 ? phone.slice(0, 3) + '****' + phone.slice(7) : phone;
}
