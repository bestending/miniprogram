/**
 * 顾客登录（ADR-0016：手机号 + 顾客短码）。
 * 不发 token，每次调用云函数都校验（云函数无状态）。
 * 校验通过返回顾客基本信息（编号、phoneMask）。
 *
 * 防爆破：连续失败 5 次锁该 phoneHash 1 小时（仅在内存里做基础限流，
 * 正式上线应改成 redis 或云数据库 counter；目前实现足够个人店用）。
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import { COLLECTIONS } from '../shared/constants';
import { findOne, addOne } from '../shared/query';
import { hashPhone } from '../shared/crypto';
import { getGlobalSalt, audit } from '../helpers';
import type { Customer } from '../shared/types';

export interface CustomerLoginEvent {
  action: 'customerLogin';
  phone?: string;
  customerCode?: string;
}

const PHONE_REGEX = /^1[3-9]\d{9}$/;

// 简易失败计数（进程内 Map，单实例；多实例需改云数据库）
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60 * 60 * 1000;

export async function customerLogin(event: CustomerLoginEvent) {
  const phone = String(event.phone ?? '').trim();
  const customerCode = String(event.customerCode ?? '').trim();
  if (!PHONE_REGEX.test(phone)) {
    return fail(AUTH_ERRORS.INVALID_PHONE_FORMAT, '手机号格式错误');
  }
  if (!/^\d{4}$/.test(customerCode)) {
    return fail(AUTH_ERRORS.CUSTOMER_CREDENTIAL_INVALID, '顾客编号应为 4 位数字');
  }

  const salt = getGlobalSalt();
  const phoneHash = hashPhone(phone, salt);

  // 限流检查
  const locked = loginAttempts.get(phoneHash);
  if (locked && locked.lockedUntil > Date.now()) {
    return fail(AUTH_ERRORS.CUSTOMER_CREDENTIAL_INVALID, '登录失败次数过多，请 1 小时后再试');
  }

  const customer = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { phoneHash, customerCode });
  if (!customer || customer.role !== 'customer') {
    const cur = loginAttempts.get(phoneHash) ?? { count: 0, lockedUntil: 0 };
    cur.count += 1;
    if (cur.count >= MAX_ATTEMPTS) {
      cur.lockedUntil = Date.now() + LOCK_MS;
      cur.count = 0;
    }
    loginAttempts.set(phoneHash, cur);
    return fail(AUTH_ERRORS.CUSTOMER_CREDENTIAL_INVALID, '手机号或顾客编号错误');
  }

  // 成功 → 清零失败计数
  loginAttempts.delete(phoneHash);

  // 登录成功写一条 inbox 消息（PHONE_BOUND 事件复用）
  try {
    await addOne(COLLECTIONS.INBOX_MESSAGES, {
      customerId: customer._id,
      eventKey: 'PHONE_BOUND',
      title: '顾客端登录成功',
      payload: { phoneMask: maskPhone(phone) },
      read: false,
      createdAt: Date.now()
    });
  } catch (e) {
    console.error('[customerLogin] inbox write failed', e);
  }

  await audit(customer._id, 'customer', 'customer_login', 'customer', customer._id, { phoneMask: maskPhone(phone) });

  return ok({
    customerId: customer._id,
    customerCode: customer.customerCode,
    phoneMask: maskPhone(phone)
  });
}

function maskPhone(phone: string): string {
  return phone.slice(0, 3) + '****' + phone.slice(7);
}