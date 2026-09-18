import { getSession } from '../../utils/session';

interface InviteResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { code: string; expiresAt?: number; unusedCount?: number };
}

Page({
  data: {
    shortId: '',
    generatingCustomer: false,
    generatingStaff: false,
    customerInvite: '',
    staffInvite: ''
  },

  onShow() {
    const session = getSession();
    if (session?.customerId) {
      this.setData({ shortId: session.customerId.slice(-4).toUpperCase() });
    }
  },

  async onGenerateCustomerInvite() {
    if (this.data.generatingCustomer) return;
    this.setData({ generatingCustomer: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: { action: 'createCustomerInvite' }
      });
      const result = res.result as InviteResult;
      if (!result?.ok || !result.data?.code) {
        wx.showToast({ title: result?.message || '生成失败', icon: 'none' });
        return;
      }
      this.setData({ customerInvite: result.data.code });
      wx.setClipboardData({ data: result.data.code });
      wx.showToast({ title: '已生成并复制', icon: 'success' });
    } catch (e) {
      console.error('[dashboard] createCustomerInvite failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ generatingCustomer: false });
    }
  },

  async onGenerateStaffInvite() {
    if (this.data.generatingStaff) return;
    this.setData({ generatingStaff: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: { action: 'createStaffInvite' }
      });
      const result = res.result as InviteResult;
      if (!result?.ok || !result.data?.code) {
        wx.showToast({ title: result?.message || '生成失败', icon: 'none' });
        return;
      }
      this.setData({ staffInvite: result.data.code });
      wx.setClipboardData({ data: result.data.code });
      wx.showToast({ title: '已生成并复制（10 分钟有效）', icon: 'success' });
    } catch (e) {
      console.error('[dashboard] createStaffInvite failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ generatingStaff: false });
    }
  },

  onCopyCode(e: { currentTarget: { dataset: { code: string } } }) {
    wx.setClipboardData({ data: e.currentTarget.dataset.code });
  }
});
