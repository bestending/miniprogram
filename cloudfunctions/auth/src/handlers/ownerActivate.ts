/**
 * ownerActivate：店主一次性激活码激活（ADR-0013）。
 * 入参：{ code: string }（8 位激活码）
 * 失败 3 次锁 24h；激活码存哈希 SHA256(code + GLOBAL_SALT)，明文离线交付。
 */

import { ok, fail } from '../shared/result';
import {
  COLLECTIONS,
  OWNER_ACTIVATION_CODE_LENGTH,
  OWNER_ACTIVATION_MAX_FAILS,
  OWNER_ACTIVATION_LOCK_HOURS
} from '../shared/constants';
import { AUTH_ERRORS } from '../shared/errors';
import { hashActivationCode } from '../shared/crypto';
import { findOne, updateDoc } from '../shared/query';
import { toSession, getGlobalSalt, audit, getCtx, type AuthEvent } from '../helpers';
import type { Customer } from '../shared/types';

const MS_PER_HOUR = 3600 * 1000;

export async function ownerActivate(event: AuthEvent) {
  const code = event.code;
  if (typeof code !== 'string' || code.length !== OWNER_ACTIVATION_CODE_LENGTH) {
    return fail(AUTH_ERRORS.OWNER_ACTIVATION_CODE_INVALID, `激活码须为 ${OWNER_ACTIVATION_CODE_LENGTH} 位`);
  }

  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '无 openid');

  const owner = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid, role: 'owner' });
  if (!owner) return fail(AUTH_ERRORS.OWNER_NOT_IN_WHITELIST, '该微信号不在店主白名单');
  if (owner.activationStatus === 'active') {
    return fail(AUTH_ERRORS.OWNER_ALREADY_ACTIVATED, '店主已激活，无需重复激活');
  }

  const now = Date.now();
  if (owner.activationLockedUntil && owner.activationLockedUntil > now) {
    return fail(
      AUTH_ERRORS.OWNER_ACTIVATION_LOCKED,
      `激活已锁定，请于 ${new Date(owner.activationLockedUntil).toLocaleString()} 后重试`
    );
  }

  const salt = getGlobalSalt();
  if (hashActivationCode(code, salt) !== owner.activationCodeHash) {
    const fails = (owner.activationFails ?? 0) + 1;
    const reached = fails >= OWNER_ACTIVATION_MAX_FAILS;
    const update: Record<string, unknown> = { activationFails: fails };
    if (reached) {
      update.activationLockedUntil = now + OWNER_ACTIVATION_LOCK_HOURS * MS_PER_HOUR;
      update.activationStatus = 'locked';
    }
    await updateDoc(COLLECTIONS.CUSTOMERS, owner._id, update);
    if (reached) {
      return fail(
        AUTH_ERRORS.OWNER_ACTIVATION_FAILED_MAX,
        `连续失败 ${OWNER_ACTIVATION_MAX_FAILS} 次，锁定 ${OWNER_ACTIVATION_LOCK_HOURS} 小时`
      );
    }
    return fail(
      AUTH_ERRORS.OWNER_ACTIVATION_CODE_INVALID,
      `激活码错误，已失败 ${fails}/${OWNER_ACTIVATION_MAX_FAILS} 次`
    );
  }

  await updateDoc(COLLECTIONS.CUSTOMERS, owner._id, {
    activationStatus: 'active',
    activatedAt: now,
    activationFails: 0,
    activationLockedUntil: 0
  });
  await audit(owner._id, 'owner', 'owner_activated', 'customer', owner._id, { at: now });

  const updated: Customer = {
    ...owner,
    activationStatus: 'active',
    activatedAt: now,
    activationFails: 0,
    activationLockedUntil: 0
  };
  return ok({ session: toSession(updated), activated: true });
}
