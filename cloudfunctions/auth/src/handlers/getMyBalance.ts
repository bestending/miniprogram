/**
 * 顾客查余额（ADR-0016：每次校验手机号+顾客短码）。
 * 返回累计消费、可用余额、待定余额、顾客编号、邀请码（如有）。
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import { COLLECTIONS } from '../shared/constants';
import { findOne } from '../shared/query';
import { hashPhone } from '../shared/crypto';
import { getGlobalSalt } from '../helpers';
import type { Customer, RebateBalance, RebateCode } from '../shared/types';

export interface GetMyBalanceEvent {
  action: 'getMyBalance';
  phone?: string;
  customerCode?: string;
}

const PHONE_REGEX = /^1[3-9]\d{9}$/;

export async function getMyBalance(event: GetMyBalanceEvent) {
  const phone = String(event.phone ?? '').trim();
  const customerCode = String(event.customerCode ?? '').trim();
  if (!PHONE_REGEX.test(phone)) return fail(AUTH_ERRORS.INVALID_PHONE_FORMAT, '手机号格式错误');
  if (!/^\d{4}$/.test(customerCode)) return fail(AUTH_ERRORS.CUSTOMER_CREDENTIAL_INVALID, '顾客编号应为 4 位数字');

  const salt = getGlobalSalt();
  const phoneHash = hashPhone(phone, salt);

  const customer = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { phoneHash, customerCode });
  if (!customer || customer.role !== 'customer') {
    return fail(AUTH_ERRORS.CUSTOMER_CREDENTIAL_INVALID, '手机号或顾客编号错误');
  }

  const balance = await findOne<RebateBalance>(COLLECTIONS.REBATE_BALANCES, { customerId: customer._id });

  // 顾客自己的邀请码：找 status='active' 且 inviterId === customer._id 的最新一条
  const inviteCode = await findOne<RebateCode>(COLLECTIONS.REBATE_CODES, {
    inviterId: customer._id,
    status: 'active'
  });

  return ok({
    customerId: customer._id,
    customerCode: customer.customerCode,
    phoneMask: maskPhone(phone),
    available: balance?.available ?? 0,
    pending: balance?.pending ?? 0,
    frozen: balance?.frozen ?? 0,
    totalConsumption: balance ? balance.available + balance.pending + balance.frozen : 0,
    inviteCode: inviteCode?.code ?? null,
    updatedAt: balance?.updatedAt ?? null
  });
}

function maskPhone(phone: string): string {
  return phone.slice(0, 3) + '****' + phone.slice(7);
}