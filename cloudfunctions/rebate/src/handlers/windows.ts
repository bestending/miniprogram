/**
 * 返利窗口（节假日 / 月度活动）管理（ADR-0004/0010）。
 *
 * 触发者：owner（节假日配置仅店主可操作，ADR-0013 权限矩阵）。
 * 窗口用于 recordOrder 时匹配返利比例：enabled 且 startAt<=payTime<=endAt，
 * 多个窗口重叠取最高 rebateRate；无匹配且当日为月 15 日则默认 10%。
 */

import { fail, ok } from '../shared/result';
import { AUTH_ERRORS } from '../shared/errors';
import { COLLECTIONS } from '../shared/constants';
import { findOne, findMany, addOne, updateDoc, deleteDoc } from '../shared/query';
import { getCtx, audit } from '../helpers';
import type { Customer, RebateWindow, RebateWindowType } from '../shared/types';

/** 单店模式固定 storeId（ADR-0010：多租户为已知技术债，首期单店） */
const DEFAULT_STORE_ID = 'default';

const WINDOW_TYPES: RebateWindowType[] = ['holiday', 'monthly_15'];

async function requireOwner(): Promise<{ ok: false; result: ReturnType<typeof fail> } | { ok: true; caller: Customer }> {
  const { openid } = getCtx();
  if (!openid) return { ok: false, result: fail(AUTH_ERRORS.UNAUTHORIZED, '未登录') };
  const caller = await findOne<Customer>(COLLECTIONS.CUSTOMERS, { openid });
  if (!caller) return { ok: false, result: fail(AUTH_ERRORS.UNAUTHORIZED, '调用者未注册') };
  if (caller.role !== 'owner') return { ok: false, result: fail(AUTH_ERRORS.FORBIDDEN, '仅店主可配置节假日') };
  if (caller.activationStatus !== 'active') {
    return { ok: false, result: fail(AUTH_ERRORS.FORBIDDEN, '店主未激活') };
  }
  return { ok: true, caller };
}

// ---------- 列出窗口 ----------

export interface ListWindowsEvent {
  action: 'listWindows';
  type?: RebateWindowType;
}

export async function listWindows(event: ListWindowsEvent) {
  const auth = await requireOwner();
  if (!auth.ok) return auth.result;

  const typeFilter = event.type ? String(event.type) : undefined;
  const where: Record<string, unknown> = {};
  if (typeFilter) where.type = typeFilter;

  const windows = await findMany<RebateWindow>(COLLECTIONS.REBATE_WINDOWS, where);
  windows.sort((a, b) => b.startAt - a.startAt);

  return ok({
    windows: windows.map((w) => ({
      id: w._id,
      storeId: w.storeId,
      type: w.type,
      name: w.name,
      startAt: w.startAt,
      endAt: w.endAt,
      rebateRate: w.rebateRate,
      enabled: w.enabled,
      createdBy: w.createdBy
    }))
  });
}

// ---------- 新建窗口 ----------

export interface CreateWindowEvent {
  action: 'createWindow';
  type?: RebateWindowType;
  name?: string;
  startAt?: number;
  endAt?: number;
  rebateRate?: number;
}

export async function createWindow(event: CreateWindowEvent) {
  const auth = await requireOwner();
  if (!auth.ok) return auth.result;
  const caller = auth.caller;

  const type = (event.type ?? 'holiday') as RebateWindowType;
  const name = String(event.name ?? '').trim();
  const startAt = Number(event.startAt);
  const endAt = Number(event.endAt);
  const rebateRate = Number(event.rebateRate);

  if (!WINDOW_TYPES.includes(type)) return fail(AUTH_ERRORS.MISSING_PARAM, '活动类型无效');
  if (!name) return fail(AUTH_ERRORS.MISSING_PARAM, '活动名称不能为空');
  if (!startAt || !endAt) return fail(AUTH_ERRORS.MISSING_PARAM, '起止时间不能为空');
  if (endAt <= startAt) return fail(AUTH_ERRORS.MISSING_PARAM, '结束时间必须晚于开始时间');
  if (!rebateRate || rebateRate <= 0 || rebateRate > 1) {
    return fail(AUTH_ERRORS.MISSING_PARAM, '返利比例需在 (0, 1] 之间');
  }

  const id = await addOne(COLLECTIONS.REBATE_WINDOWS, {
    storeId: DEFAULT_STORE_ID,
    type,
    name,
    startAt,
    endAt,
    rebateRate,
    enabled: true,
    createdBy: caller._id,
    createdAt: Date.now()
  });

  await audit(caller._id, 'owner', 'create_window', 'rebate_window', id, { name, type, rebateRate });
  return ok({ id });
}

// ---------- 更新窗口 ----------

export interface UpdateWindowEvent {
  action: 'updateWindow';
  id?: string;
  name?: string;
  startAt?: number;
  endAt?: number;
  rebateRate?: number;
  enabled?: boolean;
}

export async function updateWindow(event: UpdateWindowEvent) {
  const auth = await requireOwner();
  if (!auth.ok) return auth.result;
  const caller = auth.caller;

  const id = String(event.id ?? '').trim();
  if (!id) return fail(AUTH_ERRORS.MISSING_PARAM, '窗口 id 不能为空');

  const existing = await findOne<RebateWindow>(COLLECTIONS.REBATE_WINDOWS, { _id: id });
  if (!existing) return fail(AUTH_ERRORS.CUSTOMER_NOT_FOUND, '活动不存在');

  const data: Record<string, unknown> = {};
  if (event.name !== undefined) {
    const name = String(event.name).trim();
    if (!name) return fail(AUTH_ERRORS.MISSING_PARAM, '活动名称不能为空');
    data.name = name;
  }
  if (event.startAt !== undefined) data.startAt = Number(event.startAt);
  if (event.endAt !== undefined) data.endAt = Number(event.endAt);
  if (event.rebateRate !== undefined) {
    const rate = Number(event.rebateRate);
    if (!rate || rate <= 0 || rate > 1) return fail(AUTH_ERRORS.MISSING_PARAM, '返利比例需在 (0, 1] 之间');
    data.rebateRate = rate;
  }
  if (event.enabled !== undefined) data.enabled = Boolean(event.enabled);

  if (data.startAt !== undefined && data.endAt !== undefined) {
    if (Number(data.endAt) <= Number(data.startAt)) {
      return fail(AUTH_ERRORS.MISSING_PARAM, '结束时间必须晚于开始时间');
    }
  }

  if (Object.keys(data).length === 0) return fail(AUTH_ERRORS.MISSING_PARAM, '没有需要更新的字段');

  await updateDoc(COLLECTIONS.REBATE_WINDOWS, id, data);
  await audit(caller._id, 'owner', 'update_window', 'rebate_window', id, data);
  return ok({ id });
}

// ---------- 删除窗口 ----------

export interface DeleteWindowEvent {
  action: 'deleteWindow';
  id?: string;
}

export async function deleteWindow(event: DeleteWindowEvent) {
  const auth = await requireOwner();
  if (!auth.ok) return auth.result;
  const caller = auth.caller;

  const id = String(event.id ?? '').trim();
  if (!id) return fail(AUTH_ERRORS.MISSING_PARAM, '窗口 id 不能为空');

  const existing = await findOne<RebateWindow>(COLLECTIONS.REBATE_WINDOWS, { _id: id });
  if (!existing) return fail(AUTH_ERRORS.CUSTOMER_NOT_FOUND, '活动不存在');

  await deleteDoc(COLLECTIONS.REBATE_WINDOWS, id);
  await audit(caller._id, 'owner', 'delete_window', 'rebate_window', id, { name: existing.name });
  return ok({ id });
}
