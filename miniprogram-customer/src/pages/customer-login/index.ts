import { isMainlandPhone } from 'shared';
import { CUSTOMER_CODE_LENGTH } from 'shared';
import { setCustomerLogin, getCachedPhone } from '../../utils/customer-auth';

interface LoginResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { customerId: string; customerCode: string; phoneMask: string };
}

Page({
  data: {
    phone: '',
    customerCode: '',
    loading: false
  },

  onLoad() {
    // 回填上次登录的手机号
    this.setData({ phone: getCachedPhone() });
  },

  onPhoneInput(e: { detail: { value: string } }) {
    this.setData({ phone: e.detail.value });
  },

  onCodeInput(e: { detail: { value: string } }) {
    // 只允许数字
    const v = e.detail.value.replace(/\D/g, '').slice(0, CUSTOMER_CODE_LENGTH);
    this.setData({ customerCode: v });
  },

  async onLogin() {
    const phone = (this.data as { phone: string }).phone.trim();
    const customerCode = (this.data as { customerCode: string }).customerCode.trim();

    if (!isMainlandPhone(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (customerCode.length !== CUSTOMER_CODE_LENGTH) {
      wx.showToast({ title: `请输入 ${CUSTOMER_CODE_LENGTH} 位顾客编号`, icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: { action: 'customerLogin', phone, customerCode }
      });
      const result = res.result as LoginResult;
      if (!result?.ok || !result.data) {
        wx.showToast({ title: result?.message || '登录失败', icon: 'none' });
        return;
      }
      setCustomerLogin({ ...result.data, phone });
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 600);
    } catch (e) {
      console.error('[customer-login] customerLogin failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
