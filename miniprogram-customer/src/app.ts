import { CUSTOMER_LOGIN_STORAGE_KEY } from 'shared';
import type { IAppOption } from './utils/customer-auth';

// 云开发环境 ID（与 cloudbaserc.json envId 一致，ADR-0012 单环境 default）
const CLOUD_ENV_ID = 'cloud1-d5g9lv1o9dd4e0593';

App<IAppOption>({
  globalData: {
    customerLogin: null
  },
  onLaunch() {
    if (!wx.cloud) return;
    wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true });

    // 顾客端（ADR-0016）：冷启动只恢复本地登录凭证，不调 getSession 云函数。
    // 真正的 customerId / phoneMask 在用户进入首页调 getMyBalance 时回填。
    const cached = wx.getStorageSync(CUSTOMER_LOGIN_STORAGE_KEY) as
      | { phone: string; customerCode: string }
      | null;
    if (cached?.phone && cached?.customerCode) {
      this.globalData.customerLogin = {
        customerId: '',
        customerCode: cached.customerCode,
        phoneMask: '',
        _phone: cached.phone
      };
    }
  }
});
