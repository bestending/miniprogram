import { getSession } from '../../utils/session';

interface AuditRow {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown> | null;
  createdAt: number;
}

interface ListResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { logs: AuditRow[]; total: number };
}

const ROLE_LABEL: Record<string, string> = {
  owner: '店主',
  clerk: '店员',
  customer: '顾客',
  system: '系统'
};

const ACTION_LABEL: Record<string, string> = {
  owner_activate: '店主激活',
  staff_invite_created: '生成店员邀请码',
  clerk_bound: '店员绑定',
  staff_bind_attempt: '店员绑定尝试',
  customer_created: '录入顾客',
  customer_login: '顾客登录',
  order_recorded: '录入订单',
  apply_withdraw: '申请提现',
  approve_withdraw: '通过提现',
  reject_withdraw: '拒绝提现',
  create_window: '创建活动',
  update_window: '更新活动',
  delete_window: '删除活动'
};

Page({
  data: {
    loading: true,
    logs: [] as Array<AuditRow & { roleLabel: string; actionLabel: string; timeText: string; payloadText: string }>,
    filterRole: '',
    total: 0
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
      const data: { action: 'listAuditLogs'; actorRole?: string } = { action: 'listAuditLogs' };
      if (this.data.filterRole) data.actorRole = this.data.filterRole;
      const res = await wx.cloud.callFunction({ name: 'auth', data });
      const result = res.result as ListResult;
      if (result?.ok && result.data) {
        const rows = result.data.logs.map((l) => ({
          ...l,
          roleLabel: ROLE_LABEL[l.actorRole] || l.actorRole,
          actionLabel: ACTION_LABEL[l.action] || l.action,
          timeText: new Date(l.createdAt).toLocaleString('zh-CN', { hour12: false }),
          payloadText: l.payload ? JSON.stringify(l.payload) : ''
        }));
        this.setData({ logs: rows, total: result.data.total });
      } else {
        wx.showToast({ title: result?.message || '加载失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[audit] listAuditLogs failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onFilterTap(e: { currentTarget: { dataset: { role: string } } }) {
    const role = e.currentTarget.dataset.role;
    this.setData({ filterRole: role }, () => {
      this.load();
    });
  }
});
