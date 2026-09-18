import { getSession } from '../../utils/session';

interface WindowRow {
  id: string;
  type: string;
  name: string;
  startAt: number;
  endAt: number;
  rebateRate: number;
  enabled: boolean;
}

interface ListResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { windows: WindowRow[] };
}

interface OpResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { id: string };
}

interface FormState {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  rateText: string;
}

const TYPE_LABEL: Record<string, string> = {
  holiday: '节假日',
  monthly_15: '月度活动'
};

function tsToDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateToTs(dateStr: string, endOfDay = false): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (endOfDay) dt.setHours(23, 59, 59, 999);
  return dt.getTime();
}

Page({
  data: {
    loading: true,
    windows: [] as Array<WindowRow & { typeLabel: string; startText: string; endText: string; rateText: string }>,
    showForm: false,
    saving: false,
    togglingId: '',
    deletingId: '',
    form: { id: '', name: '', startDate: '', endDate: '', rateText: '0.1' } as FormState
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
      const res = await wx.cloud.callFunction({ name: 'rebate', data: { action: 'listWindows' } });
      const result = res.result as ListResult;
      if (result?.ok && result.data) {
        const rows = result.data.windows.map((w) => ({
          ...w,
          typeLabel: TYPE_LABEL[w.type] || w.type,
          startText: tsToDate(w.startAt),
          endText: tsToDate(w.endAt),
          rateText: `${(w.rebateRate * 100).toFixed(0)}%`
        }));
        this.setData({ windows: rows });
      } else {
        wx.showToast({ title: result?.message || '加载失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[holiday] listWindows failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openCreate() {
    this.setData({
      showForm: true,
      form: { id: '', name: '', startDate: '', endDate: '', rateText: '0.1' }
    });
  },

  openEdit(e: { currentTarget: { dataset: { id: string } } }) {
    const w = this.data.windows.find((x) => x.id === e.currentTarget.dataset.id);
    if (!w) return;
    this.setData({
      showForm: true,
      form: {
        id: w.id,
        name: w.name,
        startDate: tsToDate(w.startAt),
        endDate: tsToDate(w.endAt),
        rateText: String(w.rebateRate)
      }
    });
  },

  closeForm() {
    this.setData({ showForm: false });
  },

  onFieldInput(e: { currentTarget: { dataset: { field: string } }; detail: { value: string } }) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value } as Record<string, string>);
  },

  onDateChange(e: { currentTarget: { dataset: { field: string } }; detail: { value: string } }) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value } as Record<string, string>);
  },

  async onSave() {
    const f = this.data.form;
    const name = f.name.trim();
    const rate = parseFloat(f.rateText);
    if (!name) return wx.showToast({ title: '请输入活动名称', icon: 'none' });
    if (!f.startDate || !f.endDate) return wx.showToast({ title: '请选择起止日期', icon: 'none' });
    if (!rate || rate <= 0 || rate > 1) return wx.showToast({ title: '返利比例需在 0~1 之间', icon: 'none' });

    const startAt = dateToTs(f.startDate, false);
    const endAt = dateToTs(f.endDate, true);
    if (endAt <= startAt) return wx.showToast({ title: '结束日期需晚于开始日期', icon: 'none' });

    this.setData({ saving: true });
    try {
      const isEdit = !!f.id;
      const action = isEdit ? 'updateWindow' : 'createWindow';
      const data = isEdit
        ? { action, id: f.id, name, startAt, endAt, rebateRate: rate }
        : { action, type: 'holiday', name, startAt, endAt, rebateRate: rate };
      const res = await wx.cloud.callFunction({ name: 'rebate', data });
      const result = res.result as OpResult;
      if (result?.ok) {
        wx.showToast({ title: isEdit ? '已保存' : '已创建', icon: 'success' });
        this.setData({ showForm: false });
        await this.load();
      } else {
        wx.showToast({ title: result?.message || '保存失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[holiday] save window failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async onToggle(e: { currentTarget: { dataset: { id: string } } }) {
    const id = e.currentTarget.dataset.id;
    const w = this.data.windows.find((x) => x.id === id);
    if (!w) return;
    this.setData({ togglingId: id });
    try {
      const res = await wx.cloud.callFunction({
        name: 'rebate',
        data: { action: 'updateWindow', id, enabled: !w.enabled }
      });
      const result = res.result as OpResult;
      if (result?.ok) {
        await this.load();
      } else {
        wx.showToast({ title: result?.message || '操作失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[holiday] toggle window failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ togglingId: '' });
    }
  },

  async onDelete(e: { currentTarget: { dataset: { id: string } } }) {
    const id = e.currentTarget.dataset.id;
    const w = this.data.windows.find((x) => x.id === id);
    if (!w) return;
    const modal = await wx.showModal({
      title: '删除活动',
      content: `确定删除「${w.name}」吗？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#fa5151'
    });
    if (!modal.confirm) return;

    this.setData({ deletingId: id });
    try {
      const res = await wx.cloud.callFunction({ name: 'rebate', data: { action: 'deleteWindow', id } });
      const result = res.result as OpResult;
      if (result?.ok) {
        wx.showToast({ title: '已删除', icon: 'success' });
        await this.load();
      } else {
        wx.showToast({ title: result?.message || '删除失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[holiday] delete window failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ deletingId: '' });
    }
  }
});
