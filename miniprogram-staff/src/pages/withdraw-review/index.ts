import { fenToYuanText } from 'shared';
import { getSession } from '../../utils/session';

interface WithdrawRow {
  requestId: string;
  customerId: string;
  customerCode: string;
  customerRole: string;
  amount: number;
  status: string;
  submittedAt: number;
  reviewedAt: number | null;
  rejectReason: string;
}

interface ListResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { requests: WithdrawRow[]; total: number };
}

interface ReviewResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { requestId: string; status: string };
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  paid: '已打款',
  rejected: '已拒绝'
};

Page({
  data: {
    loading: true,
    tab: 'pending',
    requests: [] as Array<WithdrawRow & { amountText: string; submittedAtText: string; statusLabel: string }>,
    total: 0
  },

  async onShow() {
    if (!getSession()) {
      wx.reLaunch({ url: '/pages/login/index' });
      return;
    }
    await this.load();
  },

  async onTabChange(e: { currentTarget: { dataset: { tab: string } } }) {
    this.setData({ tab: e.currentTarget.dataset.tab });
    await this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'withdraw',
        data: { action: 'listWithdrawRequests', status: this.data.tab }
      });
      const result = res.result as ListResult;
      if (result?.ok && result.data) {
        const rows = result.data.requests.map((r) => ({
          ...r,
          amountText: fenToYuanText(r.amount),
          submittedAtText: new Date(r.submittedAt).toLocaleString('zh-CN'),
          statusLabel: STATUS_LABEL[r.status] || r.status
        }));
        this.setData({ requests: rows, total: result.data.total });
      }
    } catch (e) {
      console.error('[withdraw-review] list failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onApprove(e: { currentTarget: { dataset: { id: string } } }) {
    const requestId = e.currentTarget.dataset.id;
    const res = await wx.showModal({
      title: '通过审核',
      content: '确认通过该提现申请？通过后需店主手动打款。',
      confirmText: '通过'
    });
    if (!res.confirm) return;
    await this.review(requestId, 'approve');
  },

  async onReject(e: { currentTarget: { dataset: { id: string } } }) {
    const requestId = e.currentTarget.dataset.id;
    const res = await wx.showModal({
      title: '拒绝申请',
      content: '拒绝后金额将退回顾客可用余额。',
      confirmText: '拒绝',
      confirmColor: '#e64340'
    });
    if (!res.confirm) return;
    await this.review(requestId, 'reject');
  },

  async review(requestId: string, decision: 'approve' | 'reject') {
    try {
      const res = await wx.cloud.callFunction({
        name: 'withdraw',
        data: { action: 'reviewWithdraw', requestId, decision }
      });
      const result = res.result as ReviewResult;
      if (result?.ok) {
        wx.showToast({ title: decision === 'approve' ? '已通过' : '已拒绝', icon: 'success' });
        await this.load();
      } else {
        wx.showToast({ title: result?.message || '操作失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[withdraw-review] review failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    }
  }
});
