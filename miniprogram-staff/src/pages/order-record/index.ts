import { isMainlandPhone, yuanToFen } from 'shared';
import { getSession } from '../../utils/session';

interface RecordResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: {
    orderId: string;
    orderNo: string;
    rebateAmount: number;
    rebateStatus: string;
    rate?: number;
    duplicate?: boolean;
  };
}

interface ImportResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: {
    total: number;
    success: number;
    failed: number;
    results: Array<{ orderNo: string; ok: boolean; message?: string; rebateAmount?: number }>;
  };
}

Page({
  data: {
    orderNo: '',
    amountYuan: '',
    newbiePhone: '',
    newbieCustomerId: '',
    loading: false,
    lastResult: '',
    importing: false,
    importResult: null as ImportResult['data'] | null
  },

  onShow() {
    if (!getSession()) {
      wx.reLaunch({ url: '/pages/login/index' });
    }
  },

  onInput(e: { currentTarget: { dataset: { field: string } }; detail: { value: string } }) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value } as Record<string, string>);
  },

  async onSubmit() {
    const orderNo = this.data.orderNo.trim();
    const amountYuan = parseFloat(this.data.amountYuan);
    const newbiePhone = this.data.newbiePhone.trim();
    const newbieCustomerId = this.data.newbieCustomerId.trim();

    if (!orderNo) return wx.showToast({ title: '请输入订单号', icon: 'none' });
    if (!amountYuan || amountYuan <= 0) return wx.showToast({ title: '请输入正确金额', icon: 'none' });
    if (!newbiePhone && !newbieCustomerId) {
      return wx.showToast({ title: '请填手机号或顾客编号', icon: 'none' });
    }
    if (newbiePhone && !isMainlandPhone(newbiePhone)) {
      return wx.showToast({ title: '手机号格式错误', icon: 'none' });
    }

    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'rebate',
        data: {
          action: 'recordOrder',
          orderNo,
          amount: yuanToFen(amountYuan),
          newbiePhone: newbiePhone || undefined,
          newbieCustomerId: newbieCustomerId || undefined
        }
      });
      const result = res.result as RecordResult;
      if (result?.ok && result.data) {
        const d = result.data;
        const msg = d.duplicate
          ? '订单已存在（幂等）'
          : `返利 ¥${(d.rebateAmount / 100).toFixed(2)}（${d.rebateStatus === 'pending' ? '待 T+7 到账' : '已入账'}）`;
        this.setData({ lastResult: msg });
        wx.showToast({ title: '录入成功', icon: 'success' });
      } else {
        wx.showToast({ title: result?.message || '录入失败', icon: 'none' });
      }
    } catch (e) {
      console.error('[order-record] recordOrder failed', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onImportExcel() {
    try {
      const chosen = await wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['xlsx', 'xls', 'csv']
      });
      const file = chosen.tempFiles[0];
      if (!file) return;

      this.setData({ importing: true, importResult: null });
      wx.showLoading({ title: '上传中…', mask: true });

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'xlsx';
      const cloudPath = `imports/orders_${Date.now()}.${ext}`;
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: file.path });

      wx.showLoading({ title: '解析导入中…', mask: true });
      const res = await wx.cloud.callFunction({
        name: 'export',
        data: { action: 'importMeituanOrders', fileID: uploadRes.fileID }
      });
      const result = res.result as ImportResult;
      if (result?.ok && result.data) {
        this.setData({ importResult: result.data });
        wx.showToast({ title: `成功 ${result.data.success} 条`, icon: 'success' });
      } else {
        wx.showToast({ title: result?.message || '导入失败', icon: 'none' });
      }
    } catch (e) {
      if ((e as { errMsg?: string }).errMsg?.includes('cancel')) return;
      console.error('[order-record] import failed', e);
      wx.showToast({ title: '导入异常', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ importing: false });
    }
  }
});
