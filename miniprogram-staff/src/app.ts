import type { SessionInfo } from 'shared';
import { SESSION_STORAGE_KEY } from 'shared';
import type { IAppOption } from './utils/session';

// 云开发环境 ID（与 cloudbaserc.json envId 一致，ADR-0012 单环境 default）
const CLOUD_ENV_ID = 'cloud1-d5g9lv1o9dd4e0593';

App<IAppOption>({
  globalData: {
    session: null
  },
  onLaunch() {
    if (!wx.cloud) return;
    wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true });

    // 冷启动恢复会话：优先读本地缓存，未命中则走 auth.getSession（隐式会话，ADR-0013）
    const cached = wx.getStorageSync(SESSION_STORAGE_KEY) as SessionInfo | null;
    if (cached) {
      this.globalData.session = cached;
      return;
    }
    wx.cloud
      .callFunction({ name: 'auth', data: { action: 'getSession' } })
      .then((res) => {
        const result = res.result as {
          ok: boolean;
          data?: { registered: boolean; session?: SessionInfo };
        };
        if (result?.ok && result.data?.registered && result.data.session) {
          this.globalData.session = result.data.session;
          wx.setStorageSync(SESSION_STORAGE_KEY, result.data.session);
        }
      })
      .catch((e) => {
        console.error('[app] getSession failed', e);
      });
  }
});
