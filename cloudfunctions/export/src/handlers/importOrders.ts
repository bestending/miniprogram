/**
 * 美团收银机 Excel 订单批量导入（ADR-0008）。
 *
 * 流程：
 *   1. 前端用 wx.cloud.uploadFile 上传 Excel，拿到 fileID
 *   2. 本函数 downloadFile 拉取，xlsx 解析首个 sheet（header=1 二维数组）
 *   3. 表头关键字匹配列：订单号 / 实付金额 / 手机号 / 支付时间
 *   4. 逐行调用 rebate.recordOrder（复用返利计算逻辑与幂等）
 *   5. 返回成功/失败统计与失败明细
 */

import * as XLSX from 'xlsx';
import { fail, ok } from '../shared/result';
import { cloud } from '../shared/db';
import { findOne } from '../shared/query';
import { COLLECTIONS } from '../shared/constants';
import { AUTH_ERRORS } from '../shared/errors';
import type { Customer } from '../shared/types';

export interface ImportMeituanOrdersEvent {
  action: 'importMeituanOrders';
  fileID?: string;
}

interface ParsedRow {
  orderNo: string;
  amount: number; // 分
  phone: string;
  payTime: number;
  raw: Record<string, unknown>;
}

interface ImportResultItem {
  orderNo: string;
  ok: boolean;
  message?: string;
  rebateAmount?: number;
}

/** 表头关键字 → 字段（raw 不从表头取） */
const COLUMN_KEYWORDS: Record<Exclude<keyof ParsedRow, 'raw'>, string[]> = {
  orderNo: ['订单号', '订单编号', '单号'],
  amount: ['实付', '实付金额', '支付金额', '实收', '金额'],
  phone: ['手机号', '联系电话', '电话', '手机'],
  payTime: ['支付时间', '下单时间', '完成时间', '交易时间', '时间']
};

function normalizeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** 从表头数组定位各字段列索引 */
function findColumnIndices(header: unknown[]): Partial<Record<keyof ParsedRow, number>> {
  const indices: Partial<Record<keyof ParsedRow, number>> = {};
  for (let i = 0; i < header.length; i++) {
    const cell = normalizeCell(header[i]);
    if (!cell) continue;
    for (const [field, keywords] of Object.entries(COLUMN_KEYWORDS)) {
      if (indices[field as keyof ParsedRow] !== undefined) continue;
      if (keywords.some((k) => cell.includes(k))) {
        indices[field as keyof ParsedRow] = i;
        break;
      }
    }
  }
  return indices;
}

/** 解析金额（元）→ 分；去掉 ¥、逗号等 */
function parseAmount(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).replace(/[¥￥,\s]/g, '');
  const n = parseFloat(s);
  if (isNaN(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

/** 解析手机号（纯数字，取 11 位） */
function parsePhone(v: unknown): string {
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits.length >= 11 ? digits.slice(-11) : digits;
}

/** 解析支付时间 → 毫秒时间戳 */
function parsePayTime(v: unknown): number {
  if (!v) return Date.now();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') {
    // Excel 序列号（1900 起算的天数）
    if (v > 25569 && v < 100000) {
      return Math.round((v - 25569) * 86400 * 1000);
    }
    return v; // 已是时间戳
  }
  const s = String(v).trim();
  if (!s) return Date.now();
  // 兼容 "2026/10/1 12:00:00" 和 "2026-10-01 12:00:00"
  const ts = Date.parse(s.replace(/\//g, '-'));
  return isNaN(ts) ? Date.now() : ts;
}

export async function importMeituanOrders(event: ImportMeituanOrdersEvent) {
  const ctx = cloud.getWXContext() as { OPENID?: string };
  const openid = ctx.OPENID ?? '';
  if (!openid) return fail(AUTH_ERRORS.UNAUTHORIZED, '未登录');

  const caller = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!caller) return fail(AUTH_ERRORS.UNAUTHORIZED, '调用者未注册');
  if (caller.role !== 'owner' && caller.role !== 'clerk') {
    return fail(AUTH_ERRORS.FORBIDDEN, '仅店主/店员可导入订单');
  }

  const fileID = String(event.fileID ?? '').trim();
  if (!fileID) return fail(AUTH_ERRORS.MISSING_PARAM, '缺少文件 fileID');

  let fileBuffer: Buffer;
  try {
    const dl = await cloud.downloadFile({ fileID });
    fileBuffer = dl.fileContent;
  } catch (e) {
    console.error('[import] downloadFile failed', e);
    return fail(AUTH_ERRORS.INTERNAL_ERROR, '文件下载失败');
  }

  let rows2d: unknown[][];
  try {
    const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    rows2d = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: true, defval: '' }) as unknown[][];
  } catch (e) {
    console.error('[import] xlsx parse failed', e);
    return fail(AUTH_ERRORS.INTERNAL_ERROR, 'Excel 解析失败，请检查文件格式');
  }

  if (!rows2d || rows2d.length < 2) {
    return fail(AUTH_ERRORS.MISSING_PARAM, 'Excel 无数据行');
  }

  const header = rows2d[0];
  const colIdx = findColumnIndices(header);
  if (colIdx.orderNo === undefined) {
    return fail(AUTH_ERRORS.MISSING_PARAM, '未找到「订单号」列，请核对表头');
  }
  if (colIdx.amount === undefined) {
    return fail(AUTH_ERRORS.MISSING_PARAM, '未找到「实付金额」列，请核对表头');
  }
  if (colIdx.phone === undefined) {
    return fail(AUTH_ERRORS.MISSING_PARAM, '未找到「手机号」列，请核对表头');
  }

  const parsed: ParsedRow[] = [];
  for (let i = 1; i < rows2d.length; i++) {
    const row = rows2d[i];
    if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;
    const orderNo = normalizeCell(row[colIdx.orderNo!]);
    if (!orderNo) continue;
    parsed.push({
      orderNo,
      amount: parseAmount(row[colIdx.amount!]),
      phone: parsePhone(row[colIdx.phone!]),
      payTime: colIdx.payTime !== undefined ? parsePayTime(row[colIdx.payTime]) : Date.now(),
      raw: Object.fromEntries(header.map((h, idx) => [normalizeCell(h) || `col${idx}`, row[idx]]))
    });
  }

  if (parsed.length === 0) {
    return fail(AUTH_ERRORS.MISSING_PARAM, '未解析到有效订单行');
  }

  // 逐行调用 rebate.recordOrder（复用返利计算与幂等）
  const results: ImportResultItem[] = [];
  let success = 0;
  let failed = 0;

  for (const r of parsed) {
    try {
      const res = (await cloud.callFunction({
        name: 'rebate',
        data: {
          action: 'recordOrder',
          orderNo: r.orderNo,
          amount: r.amount,
          newbiePhone: r.phone,
          payTime: r.payTime
        }
      })) as unknown as { result: { ok: boolean; code?: string; message?: string; data?: { rebateAmount: number } } };
      const result = res.result;
      if (result?.ok) {
        success += 1;
        results.push({ orderNo: r.orderNo, ok: true, rebateAmount: result.data?.rebateAmount });
      } else {
        failed += 1;
        results.push({ orderNo: r.orderNo, ok: false, message: result?.message ?? '录单失败' });
      }
    } catch {
      failed += 1;
      results.push({ orderNo: r.orderNo, ok: false, message: '云函数调用异常' });
    }
  }

  return ok({
    total: parsed.length,
    success,
    failed,
    results
  });
}
