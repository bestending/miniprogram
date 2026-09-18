/** 金额（分）必须为正整数 */
export function isPositiveFen(amount: number): boolean {
  return Number.isInteger(amount) && amount > 0;
}

/** 金额（元）合法性：正数，最多两位小数（ADR-0005 提现/ADR-0002 返利金额输入场景） */
export function isYuanAmount(value: number): boolean {
  return Number.isFinite(value) && value > 0 && Math.round(value * 100) / 100 === value;
}
