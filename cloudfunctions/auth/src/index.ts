import { fail } from './shared/result';
import { AUTH_ERRORS } from './shared/errors';
import { getSession } from './handlers/getSession';
import { ownerActivate } from './handlers/ownerActivate';
import { createStaffInvite } from './handlers/createStaffInvite';
import { bindClerk } from './handlers/bindClerk';
import { checkRegisterState } from './handlers/checkRegisterState';
import { registerCustomer } from './handlers/registerCustomer';
import type { AuthEvent } from './helpers';

/**
 * 认证云函数（ADR-0013）。
 * 调用方通过 wx.cloud.callFunction({ name: 'auth', data: { action, ...payload } }) 路由。
 * 隐式会话模型：不发 token，前端缓存 SessionInfo，冷启动走 getSession 恢复。
 */
export async function main(event: AuthEvent) {
  if (!event.action) {
    return fail(AUTH_ERRORS.MISSING_ACTION, '云函数调用缺少 action 字段');
  }

  try {
    switch (event.action) {
      case 'getSession':
        return await getSession();
      case 'ownerActivate':
        return await ownerActivate(event);
      case 'createStaffInvite':
        return await createStaffInvite();
      case 'bindClerk':
        return await bindClerk(event);
      case 'checkRegisterState':
        return await checkRegisterState(event);
      case 'registerCustomer':
        return await registerCustomer(event);
      default:
        return fail(AUTH_ERRORS.UNKNOWN_ACTION, `未知 action: ${event.action}`);
    }
  } catch (e) {
    console.error('[auth] uncaught', e);
    return fail(AUTH_ERRORS.INTERNAL_ERROR, '服务异常，请稍后重试');
  }
}
