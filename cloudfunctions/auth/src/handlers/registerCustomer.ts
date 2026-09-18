/**
 * registerCustomer：顾客 OpenID + 手机号注册（ADR-0013）。
 * 入参：{ inviteCode: string, phoneCode: string }
 * - phoneCode 来自前端 <button open-type="getPhoneNumber"> 回调 e.detail.code
 * - 云调用 cloud.openapi.user.getPhoneNumber 换明文手机号，存 SHA256(phone + GLOBAL_SALT)
 * - 邀请码一次绑定（rebate_codes.newbieId 写入后置 bound）
 */

import { cloud } from '../shared/db';
import { ok, fail } from '../shared/result';
import { COLLECTIONS, INVITE_CODE_LENGTH } from '../shared/constants';
import { AUTH_ERRORS } from '../shared/errors';
import { hashPhone } from '../shared/crypto';
import { findOne, addOne, updateDoc } from '../shared/query';
import { toSession, getGlobalSalt, audit, getCtx, type AuthEvent } from '../helpers';
import type { Customer, RebateCode } from '../shared/types';

// wx-server-sdk v4 类型未声明 user.getPhoneNumber，这里做最小化类型断言
interface GetPhoneNumberResult {
  phoneInfo: { phoneNumber: string };
  errCode?: number;
  errMsg?: string;
}

async function getPhoneNumber(code: string): Promise<string> {
  const res = (await (cloud as unknown as {
    openapi: { user: { getPhoneNumber: (p: { code: string }) => Promise<GetPhoneNumberResult> } };
  }).openapi.user.getPhoneNumber({ code })) as GetPhoneNumberResult;
  if (!res || !res.phoneInfo || !res.phoneInfo.phoneNumber) {
    throw new Error('getPhoneNumber 返回为空');
  }
  return res.phoneInfo.phoneNumber;
}

export async function registerCustomer(event: AuthEvent) {
  const inviteCode = event.inviteCode;
  const phoneCode = event.phoneCode;
  if (typeof inviteCode !== 'string' || inviteCode.length !== INVITE_CODE_LENGTH) {
    return fail(AUTH_ERRORS.MISSING_PARAM, '邀请码缺失或格式不符');
  }
  if (typeof phoneCode !== 'string') {
    return fail(AUTH_ERRORS.MISSING_PARAM, '缺少手机号授权 code');
  }

  const { openid, unionid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '无 openid');

  // 已注册互斥
  const existing = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (existing) return fail(AUTH_ERRORS.CUSTOMER_ALREADY_REGISTERED, '该微信号已注册');

  // 邀请码校验
  const rebateCode = await findOne<RebateCode & { _id: string }>(COLLECTIONS.REBATE_CODES, {
    code: inviteCode,
    status: 'active'
  });
  if (!rebateCode) return fail(AUTH_ERRORS.INVITE_CODE_NOT_FOUND, '邀请码不存在');
  if (rebateCode.newbieId) return fail(AUTH_ERRORS.INVITE_CODE_ALREADY_BOUND, '邀请码已被使用');

  // 云调用换手机号
  let phoneNumber: string;
  try {
    phoneNumber = await getPhoneNumber(phoneCode);
  } catch (e) {
    console.error('[registerCustomer] getPhoneNumber failed', e);
    return fail(AUTH_ERRORS.PHONE_AUTH_FAILED, '手机号授权失败');
  }

  // 手机号哈希 + 唯一性
  const salt = getGlobalSalt();
  const phoneHash = hashPhone(phoneNumber, salt);
  const dupPhone = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { phoneHash });
  if (dupPhone) return fail(AUTH_ERRORS.PHONE_ALREADY_BOUND, '该手机号已绑定其他账号');

  // 落库顾客
  const now = Date.now();
  const customerId = await addOne(COLLECTIONS.CUSTOMERS, {
    openid,
    unionid: unionid || undefined,
    phoneHash,
    role: 'customer',
    activationStatus: 'active',
    inviterId: rebateCode.inviterId,
    createdAt: now
  });

  await updateDoc(COLLECTIONS.REBATE_CODES, rebateCode._id, {
    newbieId: customerId,
    status: 'bound',
    boundAt: now
  });
  await audit(customerId, 'system', 'customer_registered', 'customer', customerId, {
    inviterId: rebateCode.inviterId
  });

  const customer: Customer = {
    _id: customerId,
    openid,
    unionid: unionid || undefined,
    phoneHash,
    role: 'customer',
    inviterId: rebateCode.inviterId,
    createdAt: now,
    activationStatus: 'active'
  };
  return ok({ session: toSession(customer) });
}
