import { WITHDRAW_THRESHOLD_YUAN, fenToYuanText } from 'shared';
import { getCustomerLogin, callAuth, clearCustomerLogin } from '../../utils/customer-auth';

interface BalanceResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: {
    customerId: string;
    customerCode: string;
    phoneMask: string;
    available: number;
    pending: number;
    frozen: number;
    totalConsumption: number;
    inviteCode: string | null;
    updatedAt: number | null;
  };
}

Page({
  data: {
    loading: true,
    available: '0.00',
    threshold: String(WITHDRAW_THRESHOLD_YUAN),
    canWithdraw: false,
    submitting: false
  },

  async onShow() {
    if (!getCustomerLogin()) {
      wx.reLaunch({ url: '/pages/customer-login/index' });
      return;
    }
    await this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await callAuth('getMyBalance');
      const result = res.result as BalanceResult;
      if (!result?.ok || !result.data) {
        clearCustomerLogin();
        wx.reLaunch({ url: '/pages/customer-login/index' });
        return;
      }
      const available = result.data.available;
      this.setData({
        available: fenToYuanText(available),
        canWithdraw: available >= WITHDRAW_THRESHOLD_YUAN * 100,
        loading: false
      });
    } catch (e) {
      console.error('[withdraw] getMyBalance failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async onSubmit() {
    if (!this.data.canWithdraw) {
      wx.showToast({ title: `余额满 ${WITHDRAW_THRESHOLD_YUAN} 元才可提现`, icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const res = await callAuth('applyWithdraw');
      const result = res.result as { ok: boolean; message?: string };
      if (result?.ok) {
        wx.showToast({ title: '申请已提交', icon: 'success' });
      } else {
        wx.showToast({ title: result?.message || '提交失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[withdraw] applyWithdraw failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
