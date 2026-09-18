import { fenToYuanText } from 'shared';
import { getCustomerLogin, setCustomerLogin, callAuth, clearCustomerLogin } from '../../utils/customer-auth';

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
    phoneMask: '',
    available: '0.00',
    pending: '0.00',
    frozen: '0.00',
    inviteCode: ''
  },

  async onShow() {
    if (!getCustomerLogin()) {
      wx.reLaunch({ url: '/pages/customer-login/index' });
      return;
    }
    await this.loadBalance();
  },

  async loadBalance() {
    this.setData({ loading: true });
    try {
      const res = await callAuth('getMyBalance');
      const result = res.result as BalanceResult;
      if (!result?.ok || !result.data) {
        // 凭证失效 → 清缓存跳登录
        clearCustomerLogin();
        wx.reLaunch({ url: '/pages/customer-login/index' });
        return;
      }
      const d = result.data;
      // 回填 customerId / phoneMask
      setCustomerLogin({
        customerId: d.customerId,
        customerCode: d.customerCode,
        phoneMask: d.phoneMask
      });
      this.setData({
        phoneMask: d.phoneMask,
        available: fenToYuanText(d.available),
        pending: fenToYuanText(d.pending),
        frozen: fenToYuanText(d.frozen),
        inviteCode: d.inviteCode || '',
        loading: false
      });
    } catch (e) {
      console.error('[index] getMyBalance failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  goBalance() {
    wx.navigateTo({ url: '/pages/balance/index' });
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/orders/index' });
  },

  goWithdraw() {
    wx.navigateTo({ url: '/pages/withdraw/index' });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新输入手机号和顾客编号才能继续，确定退出？',
      success: (res) => {
        if (!res.confirm) return;
        clearCustomerLogin();
        wx.reLaunch({ url: '/pages/customer-login/index' });
      }
    });
  }
});
