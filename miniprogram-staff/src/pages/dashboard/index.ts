import { getSession } from '../../utils/session';

interface StaffInviteResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { code: string; expiresAt: number };
}

Page({
  data: {
    shortId: '',
    role: '',
    generatingStaff: false,
    staffInvite: '',
    staffExpiresText: ''
  },

  onShow() {
    const session = getSession();
    if (!session) {
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    this.setData({
      shortId: session.customerId.slice(-4).toUpperCase(),
      role: session.role
    });
  },

  goOrderRecord() {
    wx.switchTab({ url: '/pages/order-record/index' });
  },

  goCustomers() {
    wx.navigateTo({ url: '/pages/customers/index' });
  },

  goInvites() {
    wx.navigateTo({ url: '/pages/invites/index' });
  },

  goWithdrawReview() {
    wx.switchTab({ url: '/pages/withdraw-review/index' });
  },

  goHoliday() {
    wx.navigateTo({ url: '/pages/holiday/index' });
  },

  goRanking() {
    wx.navigateTo({ url: '/pages/ranking/index' });
  },

  goAudit() {
    wx.switchTab({ url: '/pages/audit/index' });
  },

  async onGenerateStaffInvite() {
    if (this.data.generatingStaff) return;
    this.setData({ generatingStaff: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: { action: 'createStaffInvite' }
      });
      const result = res.result as StaffInviteResult;
      if (result?.ok && result.data) {
        this.setData({
          staffInvite: result.data.code,
          staffExpiresText: new Date(result.data.expiresAt).toLocaleString('zh-CN')
        });
        wx.setClipboardData({ data: result.data.code });
        wx.showToast({ title: '已生成并复制', icon: 'success' });
      } else {
        wx.showToast({ title: result?.message || '生成失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[dashboard] createStaffInvite failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ generatingStaff: false });
    }
  },

  onCopyCode() {
    if (!this.data.staffInvite) return;
    wx.setClipboardData({ data: this.data.staffInvite });
  }
});
