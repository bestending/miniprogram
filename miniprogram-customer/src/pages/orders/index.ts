import { fenToYuanText } from 'shared';
import { getCustomerLogin, callAuth, clearCustomerLogin } from '../../utils/customer-auth';

interface OrderRow {
  orderNo: string;
  amount: number;
  rebateAmount: number;
  rebateStatus: string;
  refundStatus: string;
  payTime: number | null;
}

interface OrdersResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { customerId: string; orders: OrderRow[]; total: number };
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待定',
  confirmed: '已入账',
  refunded: '已退款'
};

Page({
  data: {
    loading: true,
    orders: [] as Array<{
      orderNo: string;
      amount: string;
      rebateAmount: string;
      statusLabel: string;
      payTime: string;
    }>,
    total: 0
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
      const res = await callAuth('getMyOrders', { limit: 50 });
      const result = res.result as OrdersResult;
      if (!result?.ok || !result.data) {
        clearCustomerLogin();
        wx.reLaunch({ url: '/pages/customer-login/index' });
        return;
      }
      const rows = result.data.orders.map((o) => ({
        orderNo: o.orderNo,
        amount: fenToYuanText(o.amount),
        rebateAmount: fenToYuanText(o.rebateAmount),
        statusLabel: STATUS_LABEL[o.rebateStatus] || o.rebateStatus,
        payTime: o.payTime ? new Date(o.payTime).toLocaleString('zh-CN') : '未支付'
      }));
      this.setData({ orders: rows, total: result.data.total, loading: false });
    } catch (e) {
      console.error('[orders] getMyOrders failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
      this.setData({ loading: false });
    }
  }
});
