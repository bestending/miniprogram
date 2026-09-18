import { fenToYuanText } from 'shared';
import { getSession } from '../../utils/session';

interface RankRow {
  rank: number;
  inviterId: string;
  customerCode: string;
  totalRebate: number;
  orderCount: number;
}

interface RankingResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { monthStart: number; ranking: RankRow[] };
}

Page({
  data: {
    loading: true,
    monthLabel: '',
    ranking: [] as Array<RankRow & { totalRebateText: string; medal: string }>
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
      const res = await wx.cloud.callFunction({ name: 'rebate', data: { action: 'getRanking' } });
      const result = res.result as RankingResult;
      if (result?.ok && result.data) {
        const d = new Date(result.data.monthStart);
        const monthLabel = `${d.getFullYear()}年${d.getMonth() + 1}月`;
        const medalMap = ['🥇', '🥈', '🥉'];
        const rows = result.data.ranking.map((r) => ({
          ...r,
          totalRebateText: fenToYuanText(r.totalRebate),
          medal: medalMap[r.rank - 1] || ''
        }));
        this.setData({ monthLabel, ranking: rows });
      } else {
        wx.showToast({ title: result?.message || '加载失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[ranking] getRanking failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
