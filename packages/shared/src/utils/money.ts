/** 元 → 分（整数）。ADR 阈值以元表述，存储与计算统一用分。 */
export function yuanToFen(yuan: number): number {
  return Math.round(yuan * 100);
}

/** 分 → 元 */
export function fenToYuan(fen: number): number {
  return fen / 100;
}

/** 分 → 展示字符串，如 1234 → "12.34" */
export function fenToYuanText(fen: number): string {
  return (fen / 100).toFixed(2);
}

/** 分 → 带人民币符号的展示文本，如 1234 → "¥12.34" */
export function formatFen(fen: number): string {
  return `¥${fenToYuanText(fen)}`;
}
