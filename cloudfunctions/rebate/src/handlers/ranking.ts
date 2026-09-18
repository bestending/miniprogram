/**
 * 月度邀请人返利排行 TOP10（店主/店员后台，ADR-0011）。
 *
 * 从当月订单实时聚合：按 inviterId 分组，累计 pending + confirmed 的 rebateAmount，
 * 倒序取前 10。数据量为单店月订单级，内存聚合可接受（ADR-0010：无 JOIN，云函数手写聚合）。
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import { COLLECTIONS } from '../shared/constants';
import { findOne, findMany, command } from '../shared/query';
import { getCtx, beijingMonthStart } from '../helpers';
import type { Customer, Order } from '../shared/types';

export interface GetRankingEvent {
  action: 'getRanking';
  /** 可选：指定月份起始时间戳（北京时间当月 1 号 00:00），默认当前月 */
  monthStart?: number;
}

export async function getRanking(event: GetRankingEvent) {
  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '未登录');
  const caller = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!caller) return fail(AUTH_ERRORS.UNAUTHORIZED, '调用者未注册');
  if (caller.role === 'customer') return fail(AUTH_ERRORS.FORBIDDEN, '顾客不能查看排行');
  if (caller.role === 'owner' && caller.activationStatus !== 'active') {
    return fail(AUTH_ERRORS.FORBIDDEN, '店主未激活');
  }

  const now = Date.now();
  const monthStart = event.monthStart ? Number(event.monthStart) : beijingMonthStart(now);

  const orders = await findMany<Order>(COLLECTIONS.ORDERS, {
    payTime: command.gte(monthStart)
  });

  // 按 inviterId 聚合 pending + confirmed 的返利
  const map = new Map<string, { total: number; count: number }>();
  for (const o of orders) {
    if (!o.inviterId) continue;
    if (o.rebateStatus !== 'pending' && o.rebateStatus !== 'confirmed') continue;
    const cur = map.get(o.inviterId) ?? { total: 0, count: 0 };
    cur.total += o.rebateAmount;
    cur.count += 1;
    map.set(o.inviterId, cur);
  }

  const rows = Array.from(map.entries())
    .map(([inviterId, v]) => ({ inviterId, totalRebate: v.total, orderCount: v.count }))
    .sort((a, b) => b.totalRebate - a.totalRebate)
    .slice(0, 10);

  // 批量查邀请人 customerCode 用于展示
  const inviterIds = rows.map((r) => r.inviterId);
  const inviters = inviterIds.length
    ? await findMany<Customer>(COLLECTIONS.CUSTOMERS, { _id: command.in(inviterIds) })
    : [];
  const codeMap = new Map(inviters.map((c) => [c._id, c.customerCode ?? '']));

  const ranking = rows.map((r, i) => ({
    rank: i + 1,
    inviterId: r.inviterId,
    customerCode: codeMap.get(r.inviterId) ?? '',
    totalRebate: r.totalRebate,
    orderCount: r.orderCount
  }));

  return ok({ monthStart, ranking });
}
