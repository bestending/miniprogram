/**
 * 列出所有顾客（店主/店员后台用，ADR-0016）。
 * 返回顾客编号、角色、创建时间、邀请人。
 * 注：手机号仅存 phoneHash，列表中不展示明文手机号，以 customerCode 为标识。
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import { COLLECTIONS } from '../shared/constants';
import { findOne, findMany } from '../shared/query';
import { getCtx } from '../helpers';
import type { Customer } from '../shared/types';

export interface ListCustomersEvent {
  action: 'listCustomers';
  /** 可选：按角色过滤 customer/clerk/owner */
  role?: string;
  limit?: number;
}

export async function listCustomers(event: ListCustomersEvent) {
  const roleFilter = event.role ? String(event.role) : undefined;
  const limit = Math.min(Math.max(Number(event.limit ?? 200), 1), 500);

  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '未登录');
  const caller = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!caller) return fail(AUTH_ERRORS.UNAUTHORIZED, '调用者未注册');
  if (caller.role === 'customer') return fail(AUTH_ERRORS.FORBIDDEN, '顾客不能查看顾客列表');
  if (caller.role === 'owner' && caller.activationStatus !== 'active') {
    return fail(AUTH_ERRORS.FORBIDDEN, '店主未激活');
  }

  const where: Record<string, unknown> = roleFilter ? { role: roleFilter } : {};
  const customers = await findMany<Customer>(COLLECTIONS.CUSTOMERS, where);
  const sliced = customers.slice(0, limit);

  const rows = sliced.map((c) => ({
    customerId: c._id,
    customerCode: c.customerCode ?? '',
    role: c.role,
    inviterId: c.inviterId ?? '',
    createdAt: c.createdAt
  }));

  return ok({ customers: rows, total: customers.length });
}
