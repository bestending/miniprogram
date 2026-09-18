/**
 * 顾客查订单（ADR-0016）。
 * 返回最近 50 条订单：订单号、金额、返利金额、返利状态、时间。
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import { COLLECTIONS } from '../shared/constants';
import { findOne, findMany } from '../shared/query';
import { hashPhone } from '../shared/crypto';
import { getGlobalSalt } from '../helpers';
import type { Customer, Order } from '../shared/types';

export interface GetMyOrdersEvent {
  action: 'getMyOrders';
  phone?: string;
  customerCode?: string;
  limit?: number;
}

const PHONE_REGEX = /^1[3-9]\d{9}$/;

export async function getMyOrders(event: GetMyOrdersEvent) {
  const phone = String(event.phone ?? '').trim();
  const customerCode = String(event.customerCode ?? '').trim();
  if (!PHONE_REGEX.test(phone)) return fail(AUTH_ERRORS.INVALID_PHONE_FORMAT, '手机号格式错误');
  if (!/^\d{4}$/.test(customerCode)) return fail(AUTH_ERRORS.CUSTOMER_CREDENTIAL_INVALID, '顾客编号应为 4 位数字');

  const limit = Math.min(Math.max(Number(event.limit ?? 50), 1), 100);

  const salt = getGlobalSalt();
  const phoneHash = hashPhone(phone, salt);

  const customer = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { phoneHash, customerCode });
  if (!customer || customer.role !== 'customer') {
    return fail(AUTH_ERRORS.CUSTOMER_CREDENTIAL_INVALID, '手机号或顾客编号错误');
  }

  const orders = await findMany<Order>(COLLECTIONS.ORDERS, { newbieId: customer._id });

  // 按 payTime 倒序，截 limit 条
  orders.sort((a, b) => (b.payTime ?? 0) - (a.payTime ?? 0));
  const sliced = orders.slice(0, limit);

  return ok({
    customerId: customer._id,
    orders: sliced.map((o) => ({
      orderNo: o.orderNo,
      amount: o.amount,
      rebateAmount: o.rebateAmount,
      rebateStatus: o.rebateStatus,
      refundStatus: o.refundStatus,
      payTime: o.payTime ?? null
    })),
    total: orders.length
  });
}