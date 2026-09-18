import type { SessionInfo } from 'shared';
import { getSession, refreshSession, setSessionLocal } from '../../utils/session';

interface BindResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { session: SessionInfo };
}

Page({
  data: { code: '', loading: false },

  async onLoad() {
    // 主动拉一次会话（确保 onLaunch 的异步 getSession 已完成）
    await refreshSession();
    this.routeBySession();
  },
  async onShow() {
    await refreshSession();
    this.routeBySession();
  },

  /** 根据已恢复会话决定去向：店主待激活→激活页；已激活→后台；否则留在登录表单 */
  routeBySession() {
    const session = getSession();
    if (!session) return;
    if (session.role === 'owner' && !session.activated) {
      wx.reLaunch({ url: '/pages/activate/index' });
    } else if (session.activated) {
      wx.reLaunch({ url: '/pages/dashboard/index' });
    }
  },

  onInput(e: { detail: { value: string } }) {
    this.setData({ code: e.detail.value });
  },

  async onBind() {
    const code: string = (this.data as { code: string }).code.trim();
    if (code.length !== 6) {
      wx.showToast({ title: '请输入 6 位邀请码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: { action: 'bindClerk', code }
      });
      const result = res.result as BindResult;
      if (!result?.ok || !result.data) {
        wx.showToast({ title: result?.message || '绑定失败', icon: 'none' });
        return;
      }
      setSessionLocal(result.data.session);
      wx.showToast({ title: '绑定成功', icon: 'success' });
      setTimeout(() => wx.redirectTo({ url: '/pages/dashboard/index' }), 600);
    } catch (e) {
      console.error('[login] bindClerk failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
