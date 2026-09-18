/**
 * 领域模型类型（依据 ADR-0002/0003/0005/0010/0013/0014/0015）。
 * 约定：所有金额字段单位为「分」（整数），ADR 中以「元」表述的阈值见 constants.ts。
 * 时间字段统一为毫秒时间戳 number；云数据库自带 _id。
 */

// ---------- 身份与角色（ADR-0007/0013） ----------

export type UserRole = 'customer' | 'clerk' | 'owner';

/** 店主激活状态：待激活 / 已激活 / 已锁定（ADR-0013） */
export type CustomerActivationStatus = 'pending' | 'active' | 'locked';

export interface Customer {
  _id: string;
  openid: string;
  unionid?: string;
  /** SHA256(phone + salt)，绝不存明文（ADR-0013） */
  phoneHash?: string;
  nickName?: string;
  role: UserRole;
  /** 绑定的邀请人 customerId（一次绑定，不可换码，ADR-0003） */
  inviterId?: string;
  /** 首登记设备指纹（同设备硬互斥，ADR-0003） */
  deviceId?: string;
  createdAt: number;
  /** 店主激活状态（仅 role:'owner' 使用；customer/clerk 默认 'active'） */
  activationStatus?: CustomerActivationStatus;
  /** 店主激活码连续失败次数 */
  activationFails?: number;
  /** 店主激活码锁定到期时间戳（0 = 未锁） */
  activationLockedUntil?: number;
  /** 店主激活时间 */
  activatedAt?: number;
  /** 店员绑定时 IP（反查用） */
  boundIp?: string;
  /** 店主激活码哈希 SHA256(code + GLOBAL_SALT)，仅 role:'owner' pending 期持有 */
  activationCodeHash?: string;
}

/**
 * 前端缓存的会话信息（隐式会话模型，不暴露 openid，ADR-0013）。
 * 由 auth 云函数 getSession 返回，前端写 storage 缓存。
 */
export interface SessionInfo {
  customerId: string;
  role: UserRole;
  activationStatus?: CustomerActivationStatus;
  /** 是否已激活可进后台（owner 看 activationStatus==='active'，其他角色恒 true） */
  activated: boolean;
}

// ---------- 邀请码（ADR-0010） ----------

export type RebateCodeStatus = 'active' | 'bound' | 'used' | 'expired';

export interface RebateCode {
  _id: string;
  /** 6 位邀请码 */
  code: string;
  inviterId: string;
  /** 绑定后填入被邀请人 customerId */
  newbieId?: string;
  status: RebateCodeStatus;
  createdAt: number;
  boundAt?: number;
  usedAt?: number;
}

// ---------- 订单与返利状态机（ADR-0002/0010） ----------

/** 返利状态：待定（T+7 中）/ 已计入余额 / 已退款 */
export type RebateStatus = 'pending' | 'confirmed' | 'refunded';

/** 退款状态（ADR-0002：全额/部分按比例扣回） */
export type RefundStatus = 'none' | 'partial_refund' | 'full_refund';

export interface Order {
  _id: string;
  orderNo: string;
  /** 订单金额，分 */
  amount: number;
  newbieId: string;
  inviterId: string;
  codeId: string;
  payTime?: number;
  verifyTime?: number;
  /** 锁定后的返利金额（分），immutable，只随状态机推进 */
  rebateAmount: number;
  rebateStatus: RebateStatus;
  refundStatus: RefundStatus;
  rebateWindowId?: string;
  confirmedAt?: number;
  /** 乐观锁版本号（ADR-0010） */
  version: number;
}

// ---------- 返利余额（ADR-0002/0005/0010） ----------

export interface BalanceEntry {
  /** 关联订单号 */
  orderNo: string;
  amount: number;
  expireAt: number;
  /** 到期前 7 天预警是否已推送（ADR-0015） */
  notified?: boolean;
}

export interface RebateBalance {
  _id: string;
  customerId: string;
  /** 可用余额，分（退款扣回允许为负，ADR-0002） */
  available: number;
  /** T+7 缓冲期中的待定金额，分 */
  pending: number;
  /** 过期前锁定金额，分 */
  frozen: number;
  /** 90 天有效期明细队列 */
  expireSoonList: BalanceEntry[];
  updatedAt: number;
}

// ---------- 返利窗口（ADR-0004/0010） ----------

export type RebateWindowType = 'holiday' | 'monthly_15';

export interface RebateWindow {
  _id: string;
  storeId: string;
  type: RebateWindowType;
  name: string;
  startAt: number;
  endAt: number;
  /** 返利比例，0.10 = 10%；重叠取较高值（ADR-0004） */
  rebateRate: number;
  enabled: boolean;
  createdBy: string;
}

// ---------- 提现（ADR-0005/0010） ----------

export type WithdrawStatus = 'pending' | 'approved' | 'paid' | 'rejected';

export interface WithdrawRequest {
  _id: string;
  customerId: string;
  amount: number;
  status: WithdrawStatus;
  /** 提交时当月已用额度，分 */
  monthUsed: number;
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectReason?: string;
  /** 微信企业付款单号 */
  wxTransferId?: string;
  paidAt?: number;
}

// ---------- 审计日志（ADR-0007/0010） ----------

export type ActorRole = 'owner' | 'clerk' | 'system';

export interface AuditLog {
  _id: string;
  actorId: string;
  actorRole: ActorRole;
  action: string;
  targetType: string;
  targetId: string;
  payload?: Record<string, unknown>;
  createdAt: number;
}

// ---------- 店员邀请（ADR-0013，辅助集合） ----------

export type StaffInvitationStatus = 'unused' | 'used' | 'expired';

export interface StaffInvitation {
  _id: string;
  /** 6 位一次性邀请码，10 分钟有效 */
  code: string;
  createdBy: string;
  status: StaffInvitationStatus;
  expiresAt: number;
  usedBy?: string;
  createdAt: number;
}

// ---------- 通知（ADR-0014，辅助集合） ----------

export interface InboxMessage {
  _id: string;
  customerId: string;
  eventKey: string;
  title: string;
  payload?: Record<string, unknown>;
  read: boolean;
  createdAt: number;
}

/** 每日订阅消息推送计数 (customerId, date) */
export interface DailyPushCounter {
  _id: string;
  customerId: string;
  /** YYYY-MM-DD（北京时间） */
  date: string;
  count: number;
}

// ---------- 月度聚合（ADR-0015，辅助集合） ----------

export interface MonthlyAggregateRow {
  inviterId: string;
  /** 当月返利合计，分 */
  totalRebate: number;
  qualifyingOrderCount: number;
}

export interface MonthlyAggregate {
  _id: string;
  /** YYYY-MM */
  month: string;
  storeId: string;
  rows: MonthlyAggregateRow[];
  createdAt: number;
}

export interface Top10CacheEntry {
  customerId: string;
  totalRebate: number;
  rank: number;
}

export interface Top10Cache {
  _id: string;
  month: string;
  storeId: string;
  entries: Top10CacheEntry[];
  updatedAt: number;
}

// ---------- 云函数通用返回 ----------

export interface FunctionResult<T = unknown> {
  ok: boolean;
  data?: T;
  code?: string;
  message?: string;
}
