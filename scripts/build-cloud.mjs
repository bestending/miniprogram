/**
 * 云函数构建（ADR-0012）。
 *
 *   node scripts/build-cloud.mjs            编译全部云函数
 *   node scripts/build-cloud.mjs --check    仅类型检查（--noEmit，不产出部署文件）
 *
 * 每个函数：
 *   cloudfunctions/shared 的 TS 源码 拷入 src/shared（generated）
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
