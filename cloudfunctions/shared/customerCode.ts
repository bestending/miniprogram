/**
 * 顾客 4 位数字短码生成（ADR-0016）。
 * 字符集排除 0（视觉易混淆），编码空间 = 9^4 = 6561。
 * 店内顾客 < 500 时碰撞概率 < 5%（生日悖论），靠唯一索引 + 重试 50 次兜底。
 */
import * as crypto from 'node:crypto';
import { findOne } from './query';
import { COLLECTIONS } from './constants';

const CODE_CHARS = '123456789';
const CODE_LENGTH = 4;
const MAX_RETRIES = 50;

/** 单次生成一个 4 位短码（不查重） */
export function generateCustomerCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

/** 生成一个在 customers 集合中尚未被占用的 4 位短码 */
export async function generateUniqueCustomerCode(): Promise<string> {
  for (let i = 0; i < MAX_RETRIES; i += 1) {
    const code = generateCustomerCode();
    const exists = await findOne(COLLECTIONS.CUSTOMERS, { customerCode: code });
    if (!exists) {
      return code;
    }
  }
  throw new Error('顾客短码生成失败：编码空间耗尽');
}