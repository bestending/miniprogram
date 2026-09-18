/** 大陆手机号校验（顾客认证 OpenID + 手机号，ADR-0013） */
export function isMainlandPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}
