/**
 * miniprogram-ci 上传体验版（ADR-0012）。
 *
 *   node scripts/upload-mm.mjs <customer|staff>
 *
 * 需要的环境变量（GitHub Secrets / Variables，本地调试时自行注入）：
 *   WX_APPID_<CUSTOMER|STAFF>          小程序 appid
 *   WX_PRIVATE_KEY_<CUSTOMER|STAFF>    小程序后台下载的上传代码私钥（PEM 全文）
 *   VERSION                            版本号（CI 用 run_number，本地默认 dev-时间戳）
 *   DESC                               版本描述（CI 用 commit message）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ci from 'miniprogram-ci';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2];
if (app !== 'customer' && app !== 'staff') {
  console.error('用法: node scripts/upload-mm.mjs <customer|staff>');
  process.exit(1);
}

const suffix = app.toUpperCase();
const appid = process.env[`WX_APPID_${suffix}`];
const privateKey = process.env[`WX_PRIVATE_KEY_${suffix}`];
if (!appid || !privateKey) {
  console.error(`缺少 WX_APPID_${suffix} / WX_PRIVATE_KEY_${suffix} 环境变量`);
  process.exit(1);
}

const appDir = path.join(root, `miniprogram-${app}`);
const projectPath = path.join(appDir, 'miniprogram');
const keyPath = path.join(os.tmpdir(), `wx-private-key-${app}-${process.pid}.pem`);
fs.writeFileSync(keyPath, privateKey.replace(/\\n/g, '\n'), { mode: 0o600 });

const version = process.env.VERSION ?? `dev-${new Date().toISOString().slice(0, 10)}`;
const desc = process.env.DESC ?? 'manual upload';

try {
  // 先在产物目录内完成「构建 npm」（等价于开发者工具的构建 npm）
  await ci.packNpmManually({
    packageJsonPath: path.join(appDir, 'package.json'),
    miniprogramNpmDistDir: `${projectPath}${path.sep}`
  });

  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath,
    privateKeyPath: keyPath,
    ignores: ['**/node_modules/**/*']
  });

  const result = await ci.upload({
    project,
    version,
    desc,
    setting: { es6: true, minify: true, autoPrefixWXSS: true },
    robot: Number(process.env.ROBOT ?? 1)
  });

  console.log(`[${app}] 体验版上传成功：version=${version}`);
  if (result?.subPackageInfo) console.log(JSON.stringify(result.subPackageInfo, null, 2));
} finally {
  fs.rmSync(keyPath, { force: true });
}
