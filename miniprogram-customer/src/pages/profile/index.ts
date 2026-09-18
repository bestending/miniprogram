import { getSession, clearSession } from '../../utils/session';

const ROLE_LABEL: Record<string, string> = {
  customer: '顾客',
  clerk: '店员',
  owner: '店主'
};

Page({
  data: {
    customerId: '',
    role: '',
    roleLabel: ''
  },

  onShow() {
    const session = getSession();
    if (session) {
      this.setData({
        customerId: session.customerId,
        role: session.role,
        roleLabel: ROLE_LABEL[session.role] || session.role
      });
    }
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新授权手机号才能继续使用，确定退出？',
      success: (res) => {
        if (!res.confirm) return;
        clearSession();
        wx.reLaunch({ url: '/pages/register/index' });
      }
    });
  }
});
