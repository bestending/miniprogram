import { isMainlandPhone, fenToYuanText } from 'shared';
import { getSession } from '../../utils/session';

interface CustomerRow {
  customerId: string;
  customerCode: string;
  role: string;
  inviterId: string;
  createdAt: number;
}

interface ListResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { customers: CustomerRow[]; total: number };
}

interface CreateResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { customerId: string; customerCode: string; phoneMask: string; alreadyExists: boolean };
}

interface BalanceResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { available: number; pending: number; frozen: number };
}

const ROLE_LABEL: Record<string, string> = {
  customer: '顾客',
  clerk: '店员',
  owner: '店主'
};

Page({
  data: {
    loading: true,
    customers: [] as Array<CustomerRow & { roleLabel: string; createdAtText: string }>,
    showForm: false,
    phone: '',
    creating: false,
    selectedCustomerId: '',
    balance: null as { available: string; pending: string; frozen: string } | null
  },

  async onShow() {
    if (!getSession()) {
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    await this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: { action: 'listCustomers', role: 'customer' }
      });
      const result = res.result as ListResult;
      if (result?.ok && result.data) {
        const rows = result.data.customers.map((c) => ({
          ...c,
          roleLabel: ROLE_LABEL[c.role] || c.role,
          createdAtText: new Date(c.createdAt).toLocaleDateString('zh-CN')
        }));
        this.setData({ customers: rows });
      }
    } catch (e) {
      console.error('[customers] listCustomers failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  toggleForm() {
    this.setData({ showForm: !this.data.showForm, phone: '' });
  },

  onPhoneInput(e: { detail: { value: string } }) {
    this.setData({ phone: e.detail.value });
  },

  async onCreateCustomer() {
    const phone = this.data.phone.trim();
    if (!isMainlandPhone(phone)) {
      return wx.showToast({ title: '手机号格式错误', icon: 'none' });
    }
    this.setData({ creating: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: { action: 'adminCreateCustomer', phone }
      });
      const result = res.result as CreateResult;
      if (result?.ok && result.data) {
        const d = result.data;
        wx.showModal({
          title: d.alreadyExists ? '顾客已存在' : '录入成功',
          content: `顾客编号：${d.customerCode}\n请将此编号告知顾客，用于登录查询余额`,
          showCancel: false
        });
        this.setData({ showForm: false, phone: '' });
        await this.load();
      } else {
        wx.showToast({ title: result?.message || '录入失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[customers] adminCreateCustomer failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ creating: false });
    }
  },

  async onViewBalance(e: { currentTarget: { dataset: { id: string } } }) {
    const customerId = e.currentTarget.dataset.id;
    try {
      const res = await wx.cloud.callFunction({
        name: 'rebate',
        data: { action: 'getBalance', customerId }
      });
      const result = res.result as BalanceResult;
      if (result?.ok && result.data) {
        this.setData({
          selectedCustomerId: customerId,
          balance: {
            available: fenToYuanText(result.data.available),
            pending: fenToYuanText(result.data.pending),
            frozen: fenToYuanText(result.data.frozen)
          }
        });
      } else {
        wx.showToast({ title: result?.message || '查询失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[customers] getBalance failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    }
  },

  closeBalance() {
    this.setData({ balance: null, selectedCustomerId: '' });
  }
});
