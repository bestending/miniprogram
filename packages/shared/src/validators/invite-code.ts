import { INVITE_CODE_LENGTH } from '../constants';

/**
 * 邀请码格式校验：6 位字母数字（大小写不敏感）。
 * 唯一性由 rebate_codes.code 唯一索引保证，这里只校验格式。
 */
export function isInviteCodeFormat(code: string, length: number = INVITE_CODE_LENGTH): boolean {
  return new RegExp(`^[0-9A-Za-z]{${length}}$`).test(code);
}
