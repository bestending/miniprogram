/**
 * 全量类型检查（CI 的 tsc --noEmit 环节，ADR-0012）：
 *   1. shared 先产出 dist（双小程序通过 package.json types 引用其声明）
 *   2. 双小程序 --noEmit
 *   3. 云函数 --noEmit（build-cloud --check 会先铺好 shared 垫片）
 */
import path from 'node:path';
import { spawnSync as nodeSpawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tscJs = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');

function run(label, args, cwd = root) {
  console.log(`\n[tsc] ${label}`);
  const result = nodeSpawnSync(process.execPath, [tscJs, ...args], { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('packages/shared（产出 dist 供三端消费）', ['-p', 'packages/shared/tsconfig.json']);

for (const app of ['customer', 'staff']) {
  run(`miniprogram-${app} --noEmit`, ['-p', 'tsconfig.json', '--noEmit'], path.join(root, `miniprogram-${app}`));
}

const cloudResult = nodeSpawnSync(process.execPath, [path.join(root, 'scripts', 'build-cloud.mjs'), '--check'], {
  cwd: root,
  stdio: 'inherit'
});
if (cloudResult.status !== 0) process.exit(cloudResult.status ?? 1);

console.log('\n全部类型检查通过');
