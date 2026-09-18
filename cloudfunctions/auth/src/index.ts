import { fail } from './shared/result';
import { AUTH_ERRORS } from './shared/errors';
import { getSession } from './handlers/getSession';
import { ownerActivate } from './handlers/ownerActivate';
import { createStaffInvite } from './handlers/createStaffInvite';
import { bindClerk } from './handlers/bindClerk';
import { adminCreateCustomer } from './handlers/adminCreateCustomer';
import type { AdminCreateCustomerEvent } from './handlers/adminCreateCustomer';
import { customerLogin } from './handlers/customerLogin';
import type { CustomerLoginEvent } from './handlers/customerLogin';
import { getMyBalance } from './handlers/getMyBalance';
import type { GetMyBalanceEvent } from './handlers/getMyBalance';
import { getMyOrders } from './handlers/getMyOrders';
import type { GetMyOrdersEvent } from './handlers/getMyOrders';
import { listCustomers } from './handlers/listCustomers';
import type { ListCustomersEvent } from './handlers/listCustomers';
import type { AuthEvent } from './helpers';

/**
 * 认证云函数（ADR-0013 + ADR-0016）。
 * 调用方通过 wx.cloud.callFunction({ name: 'auth', data: { action, ...payload } }) 路由。
 *
 * 店主/店员：隐式会话模型（ADR-0013），不发 token，前端缓存 SessionInfo，冷启动走 getSession 恢复。
 * 顾客：手机号+顾客短码（ADR-0016），每次调用云函数都校验，无 token。
 */
export async function main(event: AuthEvent) {
  if (!event.action) {
    return fail(AUTH_ERRORS.MISSING_ACTION, '云函数调用缺少 action 字段');
  }

  try {
    switch (event.action) {
      // ---- 店主 / 店员（微信隐式会话）----
      case 'getSession':
        return await getSession();
      case 'ownerActivate':
        return await ownerActivate(event);
      case 'createStaffInvite':
        return await createStaffInvite();
      case 'bindClerk':
        return await bindClerk(event);

      // ---- 店员/店主代录入顾客 ----
      case 'adminCreateCustomer':
        return await adminCreateCustomer(event as AdminCreateCustomerEvent);
      case 'listCustomers':
        return await listCustomers(event as ListCustomersEvent);

      // ---- 顾客（手机号+短码登录，ADR-0016）----
      case 'customerLogin':
        return await customerLogin(event as CustomerLoginEvent);
      case 'getMyBalance':
        return await getMyBalance(event as GetMyBalanceEvent);
      case 'getMyOrders':
        return await getMyOrders(event as GetMyOrdersEvent);

      default:
        return fail(AUTH_ERRORS.UNKNOWN_ACTION, `未知 action: ${event.action}`);
    }
  } catch (e) {
    console.error('[auth] uncaught', e);
    return fail(AUTH_ERRORS.INTERNAL_ERROR, '服务异常，请稍后重试');
  }
}