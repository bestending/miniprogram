/**
 * 录入订单并计算返利（ADR-0001~0004）。
 * 触发者：owner / clerk（从收银台/线下得知消费）。
 *
 * 流程：
 *   1. 校验调用者身份
 *   2. 找到被邀请人（newbie）与邀请人（inviter = newbie.inviterId）
 *   3. 匹配返利窗口（节假日取最高比例；无匹配时仅月 15 日按默认 10%）
 *   4. 计算返利金额 = floor(订单金额 × 比例)，受日/月返利上限截断
 *   5. 写入 orders（rebateAmount>0 则 pending，否则 confirmed）
 *   6. 更新 inviter 的 rebate_balances.pending
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import {
  COLLECTIONS,
  DEFAULT_REBATE_RATE,
  REBATE_DAILY_CAP_YUAN,
  REBATE_MONTHLY_CAP_YUAN
} from '../shared/constants';
import { findOne, findMany, addOne, updateDoc } from '../shared/query';
import { command } from '../shared/query';
import { hashPhone } from '../shared/crypto';
import { getCtx, getGlobalSalt, audit, beijingTodayStart, beijingMonthStart, isBeijingMonthly15th } from '../helpers';
import type { Customer, Order, RebateBalance, RebateWindow, RebateCode } from '../shared/types';

export interface RecordOrderEvent {
  action: 'recordOrder';
  orderNo?: string;
  amount?: number;
  newbieCustomerId?: string;
  newbiePhone?: string;
  payTime?: number;
}

export async function recordOrder(event: RecordOrderEvent) {
  const orderNo = String(event.orderNo ?? '').trim();
  const amount = Math.floor(Number(event.amount ?? 0));
  const newbieCustomerId = event.newbieCustomerId ? String(event.newbieCustomerId) : '';
  const newbiePhone = String(event.newbiePhone ?? '').trim();
  const payTime = event.payTime ? Number(event.payTime) : Date.now();

  if (!orderNo) return fail(AUTH_ERRORS.MISSING_PARAM, '订单号不能为空');
  if (amount <= 0) return fail(AUTH_ERRORS.MISSING_PARAM, '订单金额需大于 0');
  if (!newbieCustomerId && !newbiePhone) return fail(AUTH_ERRORS.MISSING_PARAM, '需提供顾客编号或手机号');

  // 校验调用者
  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '未登录');
  const caller = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!caller) return fail(AUTH_ERRORS.UNAUTHORIZED, '调用者未注册');
  if (caller.role === 'customer') return fail(AUTH_ERRORS.FORBIDDEN, '顾客不能录入订单');
  if (caller.role === 'owner' && caller.activationStatus !== 'active') {
    return fail(AUTH_ERRORS.FORBIDDEN, '店主未激活');
  }

  // 找被邀请人
  let newbie: Customer | undefined;
  if (newbieCustomerId) {
    newbie = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { _id: newbieCustomerId });
  } else {
    const salt = getGlobalSalt();
    const phoneHash = hashPhone(newbiePhone, salt);
    newbie = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { phoneHash, role: 'customer' });
  }
  if (!newbie || newbie.role !== 'customer') {
    return fail(AUTH_ERRORS.CUSTOMER_NOT_FOUND, '顾客不存在');
  }

  // 幂等：同一订单号不重复录入
  const existing = await findOne<Order>(COLLECTIONS.ORDERS, { orderNo });
  if (existing) {
    return ok({ orderId: existing._id, orderNo: existing.orderNo, duplicate: true });
  }

  // 邀请人
  const inviterId = newbie.inviterId;
  if (!inviterId) {
    // 没有邀请人 → 不产生返利，但仍记录订单
    const orderId = await addOne(COLLECTIONS.ORDERS, {
      orderNo,
      amount,
      newbieId: newbie._id,
      inviterId: '',
      codeId: '',
      payTime,
      rebateAmount: 0,
      rebateStatus: 'confirmed',
      refundStatus: 'none',
      version: 1
    });
    await audit(caller._id, caller.role, 'record_order_no_inviter', 'order', orderId, { orderNo, amount });
    return ok({ orderId, orderNo, rebateAmount: 0, rebateStatus: 'confirmed' });
  }

  // 绑定的邀请码（用于追溯）
  const code = await findOne<RebateCode>(COLLECTIONS.REBATE_CODES, {
    newbieId: newbie._id,
    status: 'bound'
  });

  // 计算返利比例
  const windows = await findMany<RebateWindow>(COLLECTIONS.REBATE_WINDOWS, {
    enabled: true,
    startAt: command.lte(payTime),
    endAt: command.gte(payTime)
  });
  let rate = 0;
  for (const w of windows) {
    if (w.rebateRate > rate) rate = w.rebateRate;
  }
  if (rate === 0 && isBeijingMonthly15th(payTime)) {
    rate = DEFAULT_REBATE_RATE;
  }

  let rebateAmount = 0;
  if (rate > 0) {
    const grossRebate = Math.floor(amount * rate);
    // 日 / 月返利上限（ADR-0003）
    const todayStart = beijingTodayStart(payTime);
    const monthStart = beijingMonthStart(payTime);
    const inviterOrders = await findMany<Order>(COLLECTIONS.ORDERS, { inviterId });
    const eligible = inviterOrders.filter(
      (o) => o.inviterId === inviterId && (o.rebateStatus === 'pending' || o.rebateStatus === 'confirmed')
    );
    const dailyUsed = eligible
      .filter((o) => (o.payTime ?? 0) >= todayStart)
      .reduce((s, o) => s + o.rebateAmount, 0);
    const monthlyUsed = eligible
      .filter((o) => (o.payTime ?? 0) >= monthStart)
      .reduce((s, o) => s + o.rebateAmount, 0);
    const dailyCap = REBATE_DAILY_CAP_YUAN * 100;
    const monthlyCap = REBATE_MONTHLY_CAP_YUAN * 100;
    rebateAmount = Math.min(grossRebate, Math.max(0, dailyCap - dailyUsed), Math.max(0, monthlyCap - monthlyUsed));
  }

  const rebateStatus: 'pending' | 'confirmed' = rebateAmount > 0 ? 'pending' : 'confirmed';

  const orderId = await addOne(COLLECTIONS.ORDERS, {
    orderNo,
    amount,
    newbieId: newbie._id,
    inviterId,
    codeId: code?._id ?? '',
    payTime,
    rebateAmount,
    rebateStatus,
    refundStatus: 'none',
    version: 1
  });

  // 更新邀请人余额：待定 += rebateAmount
  if (rebateAmount > 0) {
    const balance = await findOne<RebateBalance>(COLLECTIONS.REBATE_BALANCES, { customerId: inviterId });
    if (balance) {
      await updateDoc(COLLECTIONS.REBATE_BALANCES, balance._id, {
        pending: command.inc(rebateAmount),
        updatedAt: Date.now()
      });
    } else {
      await addOne(COLLECTIONS.REBATE_BALANCES, {
        customerId: inviterId,
        available: 0,
        pending: rebateAmount,
        frozen: 0,
        expireSoonList: [],
        updatedAt: Date.now()
      });
    }
  }

  await audit(caller._id, caller.role, 'record_order', 'order', orderId, {
    orderNo,
    amount,
    rebateAmount,
    rebateStatus,
    newbieId: newbie._id,
    inviterId
  });

  return ok({ orderId, orderNo, rebateAmount, rebateStatus, rate });
}
