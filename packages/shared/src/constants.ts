/**
 * 业务常量（逐条对应已 Accept 的 ADR）。
 * 金额类常量单位为「元」（ADR 原文口径），参与计算时用 utils/money 转分。
 */

import type { RebateCodeStatus, RebateStatus, RefundStatus, UserRole, WithdrawStatus } from './types';

// ---------- 集合名（ADR-0010 七张主表 + ADR-0013/0014/0015 辅助集合） ----------

export const COLLECTIONS = {
  CUSTOMERS: 'customers',
  REBATE_CODES: 'rebate_codes',
  ORDERS: 'orders',
  REBATE_BALANCES: 'rebate_balances',
  REBATE_WINDOWS: 'rebate_windows',
  WITHDRAW_REQUESTS: 'withdraw_requests',
  AUDIT_LOGS: 'audit_logs',
  STAFF_INVITATIONS: 'staff_invitations',
  INBOX_MESSAGES: 'inbox_messages',
  DAILY_PUSH_COUNTERS: 'daily_push_counters',
  MONTHLY_AGGREGATES: 'monthly_aggregates',
  TOP10_CACHE: 'top10_cache'
} as const;

// ---------- 角色（ADR-0007/0013） ----------

export const ROLES: Record<'CUSTOMER' | 'CLERK' | 'OWNER', UserRole> = {
  CUSTOMER: 'customer',
  CLERK: 'clerk',
  OWNER: 'owner'
};

// ---------- 状态枚举 ----------

export const REBATE_CODE_STATUSES: readonly RebateCodeStatus[] = ['active', 'bound', 'used', 'expired'];

export const REBATE_STATUSES: readonly RebateStatus[] = ['pending', 'confirmed', 'refunded'];

export const REFUND_STATUSES: readonly RefundStatus[] = ['none', 'partial_refund', 'full_refund'];

export const WITHDRAW_STATUSES: readonly WithdrawStatus[] = ['pending', 'approved', 'paid', 'rejected'];

// ---------- 返利核心规则（ADR-0002/0004） ----------

/** 默认返利比例 10%，节假日可由店主上调 */
export const DEFAULT_REBATE_RATE = 0.1;

/** T+7 无退款缓冲期（天） */
export const REBATE_T7_DAYS = 7;

/** 返利余额有效期（天） */
export const BALANCE_VALID_DAYS = 90;

/** 到期前预警天数 */
export const EXPIRE_SOON_DAYS = 7;

/** 每月固定返利触发日（仅当日 0:00–23:59 订单计入） */
export const MONTHLY_REBATE_DAY = 15;

// ---------- 反作弊（ADR-0003） ----------

/** 同一邀请人每日返利上限（元，运营后台可调） */
export const REBATE_DAILY_CAP_YUAN = 50;

/** 同一邀请人每月返利上限（元，运营后台可调） */
export const REBATE_MONTHLY_CAP_YUAN = 200;

// ---------- 提现（ADR-0005 + ADR-0009 平台限制 4） ----------

/** 开放提现入口的余额阈值（元） */
export const WITHDRAW_THRESHOLD_YUAN = 150;

/** 每邀请人每月提现上限（元，运营后台可调） */
export const WITHDRAW_MONTHLY_LIMIT_YUAN = 100;

/** 微信支付企业付款 API 单日单用户默认次数 */
export const WX_ENTERPRISE_PAY_USER_DAILY_LIMIT = 2;

/** 企业付款费率（约 1%，资质准备用） */
export const WX_ENTERPRISE_PAY_FEE_RATE = 0.01;

// ---------- 邀请码 / 认证（ADR-0010/0013/0016）----------

export const INVITE_CODE_LENGTH = 6;

export const STAFF_INVITE_CODE_LENGTH = 6;

/** 顾客登录短码长度（ADR-0016：手机号+顾客短码） */
export const CUSTOMER_CODE_LENGTH = 4;

/** 店员邀请码有效期（分钟） */
export const STAFF_INVITE_TTL_MINUTES = 10;

/** 店员邀请码绑定上限（次/天/IP，防爆破） */
export const STAFF_INVITE_MAX_PER_DAY_PER_IP = 50;

/** 店主一次性激活码长度 */
export const OWNER_ACTIVATION_CODE_LENGTH = 8;

/** 激活码连续失败锁定次数 */
export const OWNER_ACTIVATION_MAX_FAILS = 3;

/** 激活码失败锁定时长（小时） */
export const OWNER_ACTIVATION_LOCK_HOURS = 24;

// ---------- 会话与盐（ADR-0013 隐式会话 / ADR-0016 顾客短码） ----------

/** 店主/店员前端缓存会话信息的 storage key */
export const SESSION_STORAGE_KEY = 'session_info';

/** 顾客端缓存登录凭证的 storage key（ADR-0016：手机号+顾客短码，无 token） */
export const CUSTOMER_LOGIN_STORAGE_KEY = 'customer_login';

/** 全局 phoneHash / activationCodeHash 用的盐，存云函数环境变量 */
export const GLOBAL_SALT_ENV_KEY = 'GLOBAL_SALT';

/** 店员/顾客邀请码字符集（排除易混淆 0/O/I/1） */
export const STAFF_INVITE_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// ---------- 通知（ADR-0014） ----------

/** 订阅消息默认每日推送上限（店主可调 1/2/3/不限） */
export const DAILY_PUSH_LIMIT_DEFAULT = 1;

/** 订阅消息被拒收 */
export const WX_ERRCODE_USER_REJECT = 43101;

/** 订阅消息模板失效 */
export const WX_ERRCODE_TEMPLATE_INVALID = 40037;

/** 15 类通知事件：channel=推送通道，countable=是否计入每日上限 */
export const NOTIFICATION_EVENTS = {
  INVITE_CODE_CLAIMED: { channel: 'inbox', countable: false },
  INVITE_CODE_VERIFIED: { channel: 'inbox', countable: false },
  REBATE_PENDING: { channel: 'inbox', countable: false },
  REBATE_CREDITED: { channel: 'subscribe', countable: true },
  WITHDRAW_SUBMITTED: { channel: 'subscribe', countable: true },
  WITHDRAW_APPROVED: { channel: 'subscribe', countable: false },
  WITHDRAW_REJECTED: { channel: 'subscribe', countable: false },
  BALANCE_EXPIRING: { channel: 'subscribe', countable: false },
  HOLIDAY_START: { channel: 'subscribe', countable: true },
  PHONE_BOUND: { channel: 'inbox', countable: false },
  DEVICE_CONFLICT_WARNING: { channel: 'inbox', countable: false },
  WITHDRAW_MONTHLY_LIMIT_REACHED: { channel: 'inbox', countable: false },
  TOP10_RANKING: { channel: 'inbox', countable: false },
  CUSTOMER_SERVICE_RECEIPT: { channel: 'inbox', countable: false },
  SYSTEM_ALERT: { channel: 'inbox', countable: false }
} as const;

export type NotificationEventKey = keyof typeof NOTIFICATION_EVENTS;

// ---------- 调度与对账（ADR-0015 + ADR-0009 平台限制 5） ----------

/** T+7 批量计入单批订单数（免费版单次 ≤ 20s） */
export const T7_BATCH_SIZE = 500;

/** 日终对账差异阈值（元） */
export const RECONCILE_DIFF_THRESHOLD_YUAN = 1;

/** 免费版定时触发器上限（次/日），首期已去掉 heartbeat-ping（ADR-0009 限制 1） */
export const FREE_TIER_TIMER_LIMIT_PER_DAY = 50;
