import { getSession, refreshSession } from '../../utils/session';

Page({
  data: {
    shortId: '',
    loading: true
  },

  async onLoad() {
    // 显式刷新会话，避免 onLaunch 异步 getSession 竞态
    await refreshSession();
    this.routeBySession();
  },

  async onShow() {
    await refreshSession();
    this.setSessionInfo();
  },

  routeBySession() {
    const session = getSession();
    if (!session) {
      wx.redirectTo({ url: '/pages/register/index' });
      return;
    }
    this.setSessionInfo();
  },

  setSessionInfo() {
    const session = getSession();
    if (session?.customerId) {
      this.setData({ shortId: session.customerId.slice(-4).toUpperCase(), loading: false });
    } else {
      this.setData({ loading: false });
    }
  },

  goInvite() {
    wx.navigateTo({ url: '/pages/invite/index' });
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

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  }
});
