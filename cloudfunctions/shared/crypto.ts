/**
 * 云函数侧加密与编码工具（ADR-0013）。
 * 仅在云函数运行时使用（依赖 Node 内建 crypto），不进小程序。
 */

import * as crypto from 'node:crypto';

/** SHA-256 十六进制摘要 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/** 手机号哈希：SHA256(phone + globalSalt)，绝不存明文（ADR-0013） */
export function hashPhone(phone: string, salt: string): string {
  return sha256(phone + salt);
}

/** 激活码哈希：SHA256(code + globalSalt)，店主激活码离线生成后以哈希落库 */
export function hashActivationCode(code: string, salt: string): string {
  return sha256(code + salt);
}

/**
 * 生成指定长度的随机码（数字+大写字母，默认排除易混淆 0/O/I/1）。
 * 随机码只保证格式，落库前必须靠唯一索引 + 重试保证不重复。
 */
export function generateCode(length: number, chars: string): string {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/** 生成 32 位随机十六进制串（用于 GLOBAL_SALT 等密钥的初始化） */
export function randomSalt(): string {
  return crypto.randomBytes(32).toString('hex');
}
