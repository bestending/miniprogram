/**
 * 云函数构建（ADR-0012）。
 *
 *   node scripts/build-cloud.mjs            编译全部云函数
 *   node scripts/build-cloud.mjs --check    仅类型检查（--noEmit，不产出部署文件）
 *
 * 每个函数：
 *   cloudfunctions/shared 的 TS 源码 拷入 src/shared（generated）
 *   packages/shared/src 的纯领域文件（types/constants/errors）也拷入 src/shared
 *     —— 让云函数运行时可用业务常量/错误码，类型与小程序同源，避免重复维护
 *   src/index.ts + src/shared/*.ts —— tsc ——> 函数根（index.js + shared/*.js）
 *   产物与 package.json/config.json 同级，tcb --dir 可直接部署
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync as nodeSpawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tscJs = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');
const checkOnly = process.argv.includes('--check');

const FUNCTIONS = ['auth', 'rebate', 'notify', 'withdraw', 'payment', 'daily-task', 'reconcile', 'export'];

// 与小程序同源的纯领域文件（仅类型/常量/错误码，无运行时副作用、无小程序专属依赖）。
// 拷入每个函数的 src/shared/，使云函数运行时可直接 import { COLLECTIONS, AUTH_ERRORS }。
const SHARED_DOMAIN_FILES = ['types.ts', 'constants.ts', 'errors.ts'];

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

let failed = 0;

for (const name of FUNCTIONS) {
  const fnDir = path.join(root, 'cloudfunctions', name);

  // 1. shared TS 源码铺入 src/shared（生成物，gitignored）
  copyDir(path.join(root, 'cloudfunctions', 'shared'), path.join(fnDir, 'src', 'shared'));

  // 1b. 同源领域文件（types/constants/errors）铺入 src/shared，覆盖 cloudfunctions/shared 无同名文件
  const domainSrc = path.join(root, 'packages', 'shared', 'src');
  const domainDest = path.join(fnDir, 'src', 'shared');
  for (const f of SHARED_DOMAIN_FILES) {
    fs.copyFileSync(path.join(domainSrc, f), path.join(domainDest, f));
  }

  // 2. tsc（emit 时产出 index.js + shared/*.js 到函数根）
  const args = [tscJs, '-p', 'tsconfig.json'];
  if (checkOnly) args.push('--noEmit');
  const result = nodeSpawnSync(process.execPath, args, { cwd: fnDir, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[cloud:${name}] tsc ${checkOnly ? '类型检查' : '编译'}失败`);
    failed += 1;
  } else {
    console.log(`[cloud:${name}] ${checkOnly ? '类型检查通过' : '编译完成'}`);
  }
}

if (failed > 0) process.exit(1);
