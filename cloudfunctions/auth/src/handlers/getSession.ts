/**
 * getSession：冷启动恢复会话（ADR-0013 隐式会话）。
 * 入参：无（wxContext 自带 openid）
 * 返回：{ registered: true, session } | { registered: false }
 */

import { ok, fail } from '../shared/result';
import { COLLECTIONS } from '../shared/constants';
import { AUTH_ERRORS } from '../shared/errors';
import { findOne } from '../shared/query';
import { toSession, getCtx } from '../helpers';
import type { Customer } from '../shared/types';

export async function getSession() {
  const { openid } = getCtx();
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '无 openid');

  const customer = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!customer) {
    return ok({ registered: false });
  }
  return ok({ registered: true, session: toSession(customer) });
}
