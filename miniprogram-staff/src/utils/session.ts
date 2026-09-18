import type { SessionInfo } from 'shared';
import { SESSION_STORAGE_KEY } from 'shared';

/** staff 小程序 app 实例的 globalData 形状 */
export interface IAppOption {
  globalData: {
    session: SessionInfo | null;
  };
}

interface AuthCallResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { registered: boolean; session?: SessionInfo };
}

function callAuth(action: string, extra?: Record<string, unknown>) {
  return wx.cloud.callFunction({ name: 'auth', data: { action, ...extra } });
}

/** 取当前会话（可能为 null，表示未登录） */
export function getSession(): SessionInfo | null {
  return getApp<IAppOption>().globalData.session;
}

/** 取必须存在的会话，未登录抛错 */
export function requireSession(): SessionInfo {
  const s = getSession();
  if (!s) throw new Error('未登录');
  return s;
}

/** 本地写入会话（绑定/激活成功后用） */
export function setSessionLocal(session: SessionInfo): void {
  getApp<IAppOption>().globalData.session = session;
  wx.setStorageSync(SESSION_STORAGE_KEY, session);
}

/** 清除会话 */
export function clearSession(): void {
  getApp<IAppOption>().globalData.session = null;
  wx.removeStorageSync(SESSION_STORAGE_KEY);
}

/** 重新拉取一次会话；未注册返回 null */
export async function refreshSession(): Promise<SessionInfo | null> {
  const res = await callAuth('getSession');
  const result = res.result as AuthCallResult;
  if (!result?.ok || !result.data) throw new Error(result?.message || '会话获取失败');
  const session = result.data.registered && result.data.session ? result.data.session : null;
  if (session) setSessionLocal(session);
  else clearSession();
  return session;
}
