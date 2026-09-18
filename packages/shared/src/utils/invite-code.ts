import { INVITE_CODE_LENGTH } from '../constants';

/** 去掉易混淆字符（0/O、1/I）的字母表 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * 生成邀请码（默认 6 位）。
 * 注意：随机码只保证格式，落库前必须靠 code 唯一索引 + 重试保证不重复。
 */
export function generateInviteCode(length: number = INVITE_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
