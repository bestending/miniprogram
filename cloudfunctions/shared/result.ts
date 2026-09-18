export function ok<T>(data?: T): { ok: true; data?: T } {
  return { ok: true, data };
}

export function fail(code: string, message: string): { ok: false; code: string; message: string } {
  return { ok: false, code, message };
}
