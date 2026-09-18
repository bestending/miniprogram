import { refreshSession } from '../../utils/session';

interface InviteResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { code: string; createdAt: number; isNew: boolean };
}

Page({
  data: {
    code: '',
    loading: true
  },

  async onLoad() {
    await refreshSession();
    await this.loadCode();
  },

  async onShow() {
    await this.loadCode();
  },

  async loadCode() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: { action: 'getMyInviteCode' }
      });
      const result = res.result as InviteResult;
      if (!result?.ok || !result.data?.code) {
        wx.showToast({ title: result?.message || '加载失败', icon: 'none' });
        return;
      }
      this.setData({ code: result.data.code, loading: false });
    } catch (e) {
      console.error('[invite] getMyInviteCode failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onCopy() {
    if (!this.data.code) return;
    wx.setClipboardData({ data: this.data.code });
  },

  onShareAppMessage() {
    return {
      title: '邀请你一起拿返利',
      path: `/pages/register/index?code=${this.data.code}`
    };
  }
});
