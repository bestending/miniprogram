import cloud from 'wx-server-sdk';

// 单环境 default（ADR-0012），DYNAMIC_CURRENT_ENV 自动取当前调用环境
// wx-server-sdk v4 类型把 env 标注为 string，这里 DYNAMIC_CURRENT_ENV 实际是 symbol
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV as unknown as string });

const db = cloud.database();

export { cloud, db };
