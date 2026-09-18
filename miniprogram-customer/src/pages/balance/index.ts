import { fenToYuanText } from 'shared';
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
    pending: '0.00',
    frozen: '0.00',
    totalConsumption: '0.00',
    updatedAt: ''
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
      const d = result.data;
      this.setData({
        available: fenToYuanText(d.available),
        pending: fenToYuanText(d.pending),
        frozen: fenToYuanText(d.frozen),
        totalConsumption: fenToYuanText(d.totalConsumption),
        updatedAt: d.updatedAt ? new Date(d.updatedAt).toLocaleString('zh-CN') : '暂无',
        loading: false
      });
    } catch (e) {
      console.error('[balance] getMyBalance failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
      this.setData({ loading: false });
    }
  }
});
