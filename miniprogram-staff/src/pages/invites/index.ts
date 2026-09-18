import { getSession } from '../../utils/session';

interface StaffInviteResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { code: string; expiresAt: number };
}

Page({
  data: {
    generating: false,
    code: '',
    expiresAtText: ''
  },

  onShow() {
    if (!getSession()) {
      wx.reLaunch({ url: '/pages/login/index' });
    }
  },

  async onCreate() {
    if (this.data.generating) return;
    this.setData({ generating: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: { action: 'createStaffInvite' }
      });
      const result = res.result as StaffInviteResult;
      if (result?.ok && result.data) {
        const d = result.data;
        this.setData({
          code: d.code,
          expiresAtText: new Date(d.expiresAt).toLocaleString('zh-CN')
        });
        wx.setClipboardData({ data: d.code });
        wx.showToast({ title: '已生成并复制', icon: 'success' });
      } else {
        wx.showToast({ title: result?.message || '生成失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[invites] createStaffInvite failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ generating: false });
    }
  },

  onCopy() {
    if (!this.data.code) return;
    wx.setClipboardData({ data: this.data.code });
  }
});
