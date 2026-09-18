/**
 * 认证模块统一错误码（ADR-0013）。
 * 云函数 fail(code, message) 与前端展示共用同一份字符串。
 */

export const AUTH_ERRORS = {
  // 路由
  MISSING_ACTION: 'missing_action',
  UNKNOWN_ACTION: 'unknown_action',

  // 店主激活
  OWNER_NOT_IN_WHITELIST: 'owner_not_in_whitelist',
  OWNER_ALREADY_ACTIVATED: 'owner_already_activated',
  OWNER_ACTIVATION_LOCKED: 'owner_activation_locked',
  OWNER_ACTIVATION_CODE_INVALID: 'owner_activation_code_invalid',
  OWNER_ACTIVATION_FAILED_MAX: 'owner_activation_failed_max',

  // 店员绑定
  STAFF_INVITE_NOT_FOUND: 'staff_invite_not_found',
  STAFF_INVITE_EXPIRED: 'staff_invite_expired',
  STAFF_INVITE_ALREADY_USED: 'staff_invite_already_used',
  STAFF_INVITE_IP_LIMIT: 'staff_invite_ip_limit',
  STAFF_ALREADY_BOUND: 'staff_already_bound',

  // 顾客注册 / 登录（ADR-0016：手机号+4 位短码）
  CUSTOMER_ALREADY_REGISTERED: 'customer_already_registered',
  PHONE_ALREADY_BOUND: 'phone_already_bound',
  INVITE_CODE_NOT_FOUND: 'invite_code_not_found',
  INVITE_CODE_ALREADY_BOUND: 'invite_code_already_bound',
  PHONE_AUTH_FAILED: 'phone_auth_failed',
  CUSTOMER_NOT_FOUND: 'customer_not_found',
  CUSTOMER_CREDENTIAL_INVALID: 'customer_credential_invalid',
  INVALID_ROLE_FOR_ADMIN_CREATE: 'invalid_role_for_admin_create',
  INVALID_PHONE_FORMAT: 'invalid_phone_format',

  // 通用
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  INTERNAL_ERROR: 'internal_error',
  MISSING_PARAM: 'missing_param'
} as const;

export type AuthErrorCode = (typeof AUTH_ERRORS)[keyof typeof AUTH_ERRORS];
