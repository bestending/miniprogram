/**
 * 顾客端认证工具（ADR-0016：手机号 + 4 位顾客短码，不持 openid，无 token）。
 * 每次调用云函数都回传 { phone, customerCode }，由云函数实时校验。
 */
import type { CustomerSessionInfo } from 'shared';
import { CUSTOMER_LOGIN_STORAGE_KEY } from 'shared';

/**
 * 内部存储的登录凭证：在 CustomerSessionInfo 基础上多带一个明文手机号（仅本地用，不上传）。
 * 暴露给外部时只返回 CustomerSessionInfo（不含 _phone）。
 */
interface CustomerLoginInternal extends CustomerSessionInfo {
  _phone?: string;
}

/** customer 小程序 app 实例的 globalData 形状 */
export interface IAppOption {
  globalData: {
    customerLogin: CustomerLoginInternal | null;
  };
}

interface CachedLogin {
  phone: string;
  customerCode: string;
}

function getAppGlobal(): IAppOption['globalData'] {
  return getApp<IAppOption>().globalData;
}

/** 取缓存的顾客登录凭证（可能为 null） */
export function getCustomerLogin(): CustomerSessionInfo | null {
  const g = getAppGlobal();
  if (g.customerLogin) return g.customerLogin;
  // 冷启动：从 storage 恢复（customerLogin 在 app.ts 启动时已写入 globalData，这里做兜底）
  const cached = wx.getStorageSync(CUSTOMER_LOGIN_STORAGE_KEY) as CachedLogin | null;
  if (cached?.phone && cached?.customerCode) {
    g.customerLogin = {
      customerId: '',
      customerCode: cached.customerCode,
      phoneMask: '',
      _phone: cached.phone
    };
    // 真正的 customerId / phoneMask 在 getMyBalance 调用后由调用方 setCustomerLogin 回填
    return g.customerLogin;
  }
  return null;
}

/** 写入顾客登录凭证（登录成功后用） */
export function setCustomerLogin(info: CustomerSessionInfo & { phone?: string }): void {
  const g = getAppGlobal();
  const { phone, ...rest } = info;
  g.customerLogin = { ...rest, _phone: phone || g.customerLogin?._phone };
  if (phone) {
    wx.setStorageSync(CUSTOMER_LOGIN_STORAGE_KEY, { phone, customerCode: info.customerCode });
  }
}

/** 清除登录凭证（退出登录） */
export function clearCustomerLogin(): void {
  const g = getAppGlobal();
  g.customerLogin = null;
  wx.removeStorageSync(CUSTOMER_LOGIN_STORAGE_KEY);
}

/** 取缓存的明文手机号（仅用于登录表单回填） */
export function getCachedPhone(): string {
  const g = getAppGlobal();
  if (g.customerLogin?._phone) return g.customerLogin._phone;
  const cached = wx.getStorageSync(CUSTOMER_LOGIN_STORAGE_KEY) as CachedLogin | null;
  return cached?.phone ?? '';
}

/** 调用 auth 云函数，自动附带 phone + customerCode */
export function callAuth(action: string, extra: Record<string, unknown> = {}) {
  const g = getAppGlobal();
  const cached = wx.getStorageSync(CUSTOMER_LOGIN_STORAGE_KEY) as CachedLogin | null;
  const phone = g.customerLogin?._phone || cached?.phone || '';
  const customerCode = g.customerLogin?.customerCode || cached?.customerCode || '';
  return wx.cloud.callFunction({
    name: 'auth',
    data: { action, phone, customerCode, ...extra }
  });
}
