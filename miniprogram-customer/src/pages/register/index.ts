import type { SessionInfo } from 'shared';
import { INVITE_CODE_LENGTH } from 'shared';
import { setSessionLocal } from '../../utils/session';

interface RegisterResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: { session: SessionInfo };
}

interface GetPhoneDetail {
  errMsg: string;
  code?: string;
}

Page({
  data: { inviteCode: '', codeLocked: false, loading: false },

  onLoad(options: { code?: string }) {
    const code = (options.code || '').trim();
    if (code) {
      this.setData({ inviteCode: code, codeLocked: true });
    }
  },

  onCodeInput(e: { detail: { value: string } }) {
    this.setData({ inviteCode: e.detail.value });
  },

  async onGetPhone(e: { detail: GetPhoneDetail }) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok' || !e.detail.code) {
      wx.showToast({ title: '需授权手机号才能注册', icon: 'none' });
      return;
    }
    const inviteCode: string = (this.data as { inviteCode: string }).inviteCode.trim();
    if (inviteCode.length !== INVITE_CODE_LENGTH) {
      wx.showToast({ title: `请输入 ${INVITE_CODE_LENGTH} 位邀请码`, icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: { action: 'registerCustomer', inviteCode, phoneCode: e.detail.code }
      });
      const result = res.result as RegisterResult;
      if (!result?.ok || !result.data) {
        wx.showToast({ title: result?.message || '注册失败', icon: 'none' });
        return;
      }
      setSessionLocal(result.data.session);
      wx.showToast({ title: '注册成功', icon: 'success' });
      setTimeout(() => wx.redirectTo({ url: '/pages/index/index' }), 600);
    } catch (e2) {
      console.error('[register] registerCustomer failed', e2);
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
