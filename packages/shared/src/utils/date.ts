const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** 基准时间加 n 天 */
export function addDays(base: number, days: number): number {
  return base + days * ONE_DAY_MS;
}

/** 两个毫秒时间戳相差的整天数（b - a，向下取整） */
export function diffDays(a: number, b: number): number {
  return Math.floor((b - a) / ONE_DAY_MS);
}

/** 某天 00:00（本地时区）的时间戳 */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 格式化为北京时间日期键 YYYY-MM-DD（UTC+8，不依赖运行时时区） */
export function beijingDateKey(ts: number): string {
  return new Date(ts + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
