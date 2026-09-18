import type { SessionInfo } from 'shared';
import { setSessionLocal } from '../../utils/session';

interface ActivateResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { session: SessionInfo; activated: boolean };
}

Page({
  data: { code: '', loading: false },

  onInput(e: { detail: { value: string } }) {
    this.setData({ code: e.detail.value });
  },

  async onActivate() {
    const code: string = (this.data as { code: string }).code.trim();
    if (code.length !== 8) {
      wx.showToast({ title: '请输入 8 位激活码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: { action: 'ownerActivate', code }
      });
      const result = res.result as ActivateResult;
      if (!result?.ok || !result.data) {
        wx.showToast({ title: result?.message || '激活失败', icon: 'none' });
        return;
      }
      setSessionLocal(result.data.session);
      wx.showToast({ title: '激活成功', icon: 'success' });
      setTimeout(() => wx.reLaunch({ url: '/pages/dashboard/index' }), 600);
    } catch (e) {
      console.error('[activate] ownerActivate failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
