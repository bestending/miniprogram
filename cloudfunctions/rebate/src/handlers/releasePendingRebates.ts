/**
 * T+7 返利到账定时任务（ADR-0002）。
 * 将支付满 7 天且无退款的「待定」订单转为「已入账」，
 * 对应金额从 inviter 的 pending 转入 available，并加入 90 天有效期明细。
 *
 * 触发：定时触发器（daily-task / reconcile 路由调用），也可手动触发。
 */

import { ok } from '../shared/result';
import { COLLECTIONS, REBATE_T7_DAYS, BALANCE_VALID_DAYS } from '../shared/constants';
import { findMany, findOne, updateDoc } from '../shared/query';
import { command } from '../shared/query';
import type { Order, RebateBalance } from '../shared/types';

export interface ReleasePendingRebatesEvent {
  action: 'releasePendingRebates';
  /** 可选：指定当前时间（用于测试），默认 Date.now() */
  now?: number;
  /** 可选：单次最多处理条数，默认 200（免费版单次 ≤ 20s） */
  limit?: number;
}

export async function releasePendingRebates(event: ReleasePendingRebatesEvent) {
  const now = event.now ? Number(event.now) : Date.now();
  const limit = Math.min(Math.max(Number(event.limit ?? 200), 1), 500);
  const cutoff = now - REBATE_T7_DAYS * 24 * 3600 * 1000;

  // 待定且支付满 7 天的订单
  const pendingOrders = await findMany<Order>(COLLECTIONS.ORDERS, {
    rebateStatus: 'pending',
    payTime: command.lte(cutoff)
  });

  const toProcess = pendingOrders.slice(0, limit);
  let processed = 0;

  for (const order of toProcess) {
    if (order.rebateAmount <= 0) {
      // 0 金额直接置 confirmed，不动余额
      await updateDoc(COLLECTIONS.ORDERS, order._id, {
        rebateStatus: 'confirmed',
        confirmedAt: now,
        version: command.inc(1)
      });
      processed += 1;
      continue;
    }

    // 1. 订单状态推进
    await updateDoc(COLLECTIONS.ORDERS, order._id, {
      rebateStatus: 'confirmed',
      confirmedAt: now,
      version: command.inc(1)
    });

    // 2. 邀请人余额：pending → available，加入 90 天到期明细
    const balance = await findOneBalance(order.inviterId);
    if (balance) {
      const expireAt = now + BALANCE_VALID_DAYS * 24 * 3600 * 1000;
      const newEntry = { orderNo: order.orderNo, amount: order.rebateAmount, expireAt };
      const expireSoonList = [...(balance.expireSoonList || []), newEntry];
      await updateDoc(COLLECTIONS.REBATE_BALANCES, balance._id, {
        pending: command.inc(-order.rebateAmount),
        available: command.inc(order.rebateAmount),
        expireSoonList,
        updatedAt: now
      });
    }

    processed += 1;
  }

  return ok({ processed, total: pendingOrders.length, now });
}

async function findOneBalance(customerId: string): Promise<RebateBalance | undefined> {
  return findOne<RebateBalance>(COLLECTIONS.REBATE_BALANCES, { customerId });
}
