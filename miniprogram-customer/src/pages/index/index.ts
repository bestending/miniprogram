import { getSession } from '../../utils/session';

Page({
  onLoad() {
    this.routeBySession();
  },
  onShow() {
    this.routeBySession();
  },

  /** 已注册 → 留在首页（后续阶段实现邀请码/余额/提现入口）；未注册 → 去注册页 */
  routeBySession() {
    const session = getSession();
    if (!session) {
      wx.redirectTo({ url: '/pages/register/index' });
    }
  }
});
