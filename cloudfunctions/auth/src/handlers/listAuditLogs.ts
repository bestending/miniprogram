/**
 * 审计日志列表（店主后台，ADR-0013 权限矩阵：仅店主）。
 * 按创建时间倒序，支持按角色/动作/目标类型筛选。
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import { COLLECTIONS } from '../shared/constants';
import { findOne, findMany } from '../shared/query';
import { getCtx } from '../helpers';
import type { Customer, AuditLog } from '../shared/types';

export interface ListAuditLogsEvent {
  action: 'listAuditLogs';
  actorRole?: string;
  targetType?: string;
  limit?: number;
}

export async function listAuditLogs(event: ListAuditLogsEvent) {
  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '未登录');
  const caller = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!caller) return fail(AUTH_ERRORS.UNAUTHORIZED, '调用者未注册');
  if (caller.role !== 'owner') return fail(AUTH_ERRORS.FORBIDDEN, '仅店主可查看审计日志');
  if (caller.activationStatus !== 'active') {
    return fail(AUTH_ERRORS.FORBIDDEN, '店主未激活');
  }

  const actorRole = event.actorRole ? String(event.actorRole) : undefined;
  const targetType = event.targetType ? String(event.targetType) : undefined;
  const limit = Math.min(Math.max(Number(event.limit ?? 200), 1), 500);

  const where: Record<string, unknown> = {};
  if (actorRole) where.actorRole = actorRole;
  if (targetType) where.targetType = targetType;

  const logs = await findMany<AuditLog>(COLLECTIONS.AUDIT_LOGS, where);
  logs.sort((a, b) => b.createdAt - a.createdAt);
  const sliced = logs.slice(0, limit);

  return ok({
    logs: sliced.map((l) => ({
      id: l._id,
      actorId: l.actorId,
      actorRole: l.actorRole,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      payload: l.payload ?? null,
      createdAt: l.createdAt
    })),
    total: logs.length
  });
}
