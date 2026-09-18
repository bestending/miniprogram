/**
 * 数据库查询辅助（ADR-0012）。
 * wx-server-sdk v4 的 get/count/add 返回类型为 `Promise<X> | void | string`（回调/ Promise 同签名），
 * 这里收窄到 Promise 并直接取业务字段，避免每个调用点反复断言。
 */

import { db } from './db';

/** 数据库逻辑指令（等于 db.command），供调用方构造 where 条件 */
export const command = db.command;

/** where + limit1 + get → 取首条 */
export async function findOne<T = unknown>(
  collection: string,
  where: Record<string, unknown>
): Promise<T | undefined> {
  const res = (await db.collection(collection).where(where).limit(1).get()) as unknown as { data: T[] };
  return res.data[0];
}

/** where + get → 取全部 */
export async function findMany<T = unknown>(
  collection: string,
  where: Record<string, unknown>
): Promise<T[]> {
  const res = (await db.collection(collection).where(where).get()) as unknown as { data: T[] };
  return res.data;
}

/** where + count → 总数 */
export async function countWhere(
  collection: string,
  where: Record<string, unknown>
): Promise<number> {
  const res = (await db.collection(collection).where(where).count()) as unknown as { total: number };
  return res.total;
}

/** add → 新文档 _id */
export async function addOne(
  collection: string,
  data: Record<string, unknown>
): Promise<string> {
  const res = (await db.collection(collection).add({ data })) as unknown as { _id: string };
  return res._id;
}

/** doc(id).update → 实际更新条数 */
export async function updateDoc(
  collection: string,
  id: string,
  data: Record<string, unknown>
): Promise<number> {
  const res = (await db.collection(collection).doc(id).update({ data })) as unknown as {
    stats: { updated: number };
  };
  return res.stats?.updated ?? 0;
}

/** doc(id).remove → 实际删除条数 */
export async function deleteDoc(collection: string, id: string): Promise<number> {
  const res = (await db.collection(collection).doc(id).remove()) as unknown as {
    stats: { removed: number };
  };
  return res.stats?.removed ?? 0;
}
