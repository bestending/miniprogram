/**
 * 店员/店主代录入顾客（ADR-0016）。
 * 触发者：owner / clerk。
 * 输入：phone, inviterCustomerId（可选，店员/店主/其他顾客均可）。
 * 输出：customerId + customerCode（新建）或已存在顾客信息。
 *
 * 设计：店员/店主在自己的小程序里录入顾客手机号（从收银台或线下听到），
 * 系统自动生成 customerCode（4 位），店员把 customerCode 告诉顾客。
 * 顾客下次用「手机号 + customerCode」登录顾客端看余额。
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import { COLLECTIONS } from '../shared/constants';
import { findOne, addOne } from '../shared/query';
import { hashPhone } from '../shared/crypto';
import { generateUniqueCustomerCode } from '../shared/customerCode';
import { getCtx, getGlobalSalt, audit } from '../helpers';
import type { Customer, UserRole } from '../shared/types';

export interface AdminCreateCustomerEvent {
  action: 'adminCreateCustomer';
  phone?: string;
  inviterCustomerId?: string;
  inviterRole?: UserRole;
  callerRole?: UserRole;
}

const PHONE_REGEX = /^1[3-9]\d{9}$/;

export async function adminCreateCustomer(event: AdminCreateCustomerEvent) {
  const phone = String(event.phone ?? '').trim();
  if (!PHONE_REGEX.test(phone)) {
    return fail(AUTH_ERRORS.INVALID_PHONE_FORMAT, '手机号格式错误（11 位 1[3-9]xxx）');
  }
  const inviterCustomerId = event.inviterCustomerId ? String(event.inviterCustomerId) : undefined;
  const inviterRole = event.inviterRole;
  if (inviterRole && inviterRole !== 'owner' && inviterRole !== 'clerk' && inviterRole !== 'customer') {
    return fail(AUTH_ERRORS.INVALID_ROLE_FOR_ADMIN_CREATE, '邀请人角色非法');
  }

  // 校验调用者身份（基于 wxContext.openid），确保只有 owner/clerk 能代录入
  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '未登录');
  const caller = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!caller) return fail(AUTH_ERRORS.UNAUTHORIZED, '调用者未注册');
  if (caller.role === 'customer') {
    return fail(AUTH_ERRORS.FORBIDDEN, '顾客不能代录入其他顾客');
  }
  if (caller.role === 'owner' && caller.activationStatus !== 'active') {
    return fail(AUTH_ERRORS.FORBIDDEN, '店主未激活');
  }

  const salt = getGlobalSalt();
  const phoneHash = hashPhone(phone, salt);

  // 已存在则幂等返回（同一手机号多次录入只产生一个顾客）
  const existing = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { phoneHash, role: 'customer' });
  if (existing) {
    return ok({
      customerId: existing._id,
      customerCode: existing.customerCode,
      phoneMask: maskPhone(phone),
      alreadyExists: true
    });
  }

  // 生成唯一 customerCode（4 位数字）
  const customerCode = await generateUniqueCustomerCode();

  // 邀请人校验：若传了 inviterCustomerId，则必须真存在（可邀请人 = owner/clerk/customer）
  if (inviterCustomerId) {
    const inviter = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { _id: inviterCustomerId });
    if (!inviter) {
      return fail(AUTH_ERRORS.INVITE_CODE_NOT_FOUND, '邀请人不存在');
    }
    // 店主/店员可邀请顾客；顾客也可邀请顾客（分享邀请码场景）
    if (inviter.role !== 'owner' && inviter.role !== 'clerk' && inviter.role !== 'customer') {
      return fail(AUTH_ERRORS.INVITE_CODE_NOT_FOUND, '邀请人角色非法');
    }
  }

  const customerId = await addOne(COLLECTIONS.CUSTOMERS, {
    openid: '', // 顾客没有微信身份
    phoneHash,
    customerCode,
    role: 'customer',
    inviterId: inviterCustomerId,
    inviterRole: inviterRole ?? null,
    createdAt: Date.now()
  });

  await audit(caller._id, caller.role, 'admin_create_customer', 'customer', customerId, {
    customerCode,
    inviterCustomerId,
    inviterRole
  });

  return ok({
    customerId,
    customerCode,
    phoneMask: maskPhone(phone),
    alreadyExists: false
  });
}

function maskPhone(phone: string): string {
  return phone.slice(0, 3) + '****' + phone.slice(7);
}