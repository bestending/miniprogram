/**
 * withdraw 云函数内部工具。
 */

import { cloud } from './shared/db';
import { addOne } from './shared/query';
import { COLLECTIONS, GLOBAL_SALT_ENV_KEY } from './shared/constants';
import type { ActorRole } from './shared/types';

export interface WithdrawEvent {
  action?: string;
  [key: string]: unknown;
}

export function getGlobalSalt(): string {
  const salt = process.env[GLOBAL_SALT_ENV_KEY];
  if (!salt) throw new Error(`环境变量 ${GLOBAL_SALT_ENV_KEY} 未配置`);
  return salt;
}

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

export function getCtx(): { openid: string; unionid: string; ip: string } {
  const ctx = cloud.getWXContext() as { OPENID?: string; UNIONID?: string; IP?: string };
  return {
    openid: ctx.OPENID ?? '',
    unionid: ctx.UNIONID ?? '',
    ip: ctx.IP ?? ''
  };
}
