/**
 * 小程序构建管线（ADR-0012 方案 a：src/ -> miniprogram/）。
 *
 *   node scripts/build-mm.mjs --build <customer|staff|all>   一次性构建
 *   node scripts/build-mm.mjs --watch <customer|staff>       开发模式（tsc --watch + 资源监听）
 *
 * .ts 由 tsc 编译；其余资源（.wxml/.wxss/.json/.wxs/图片等）按相对路径拷贝。
 * 产物目录 miniprogram/ 中仅保留 miniprogram_npm（由开发者工具或 miniprogram-ci 生成）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync as nodeSpawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tscJs = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');

const [mode, appArg] = process.argv.slice(2);
if (mode !== '--build' && mode !== '--watch') {
  console.error('用法: node scripts/build-mm.mjs (--build|--watch) <customer|staff|all>');
  process.exit(1);
}
const apps = appArg === 'all' ? ['customer', 'staff'] : [appArg];
if (apps.some((a) => a !== 'customer' && a !== 'staff')) {
  console.error(`未知小程序目标: ${appArg}`);
  process.exit(1);
}

const ASSET_EXT = new Set(['.wxml', '.wxss', '.json', '.wxs', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

function cleanOutDir(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of fs.readdirSync(outDir)) {
    if (entry === 'miniprogram_npm') continue; // 保留「构建 npm」产物
    fs.rmSync(path.join(outDir, entry), { recursive: true, force: true });
  }
}

function copyAsset(srcFile, srcDir, outDir) {
  const rel = path.relative(srcDir, srcFile);
  const dest = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(srcFile, dest);
}

function removeAsset(srcFile, srcDir, outDir) {
  const dest = path.join(outDir, path.relative(srcDir, srcFile));
  fs.rmSync(dest, { force: true });
}

function buildOnce(app) {
  const appDir = path.join(root, `miniprogram-${app}`);
  const srcDir = path.join(appDir, 'src');
  const outDir = path.join(appDir, 'miniprogram');

  cleanOutDir(outDir);
  const stack = [srcDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext !== '.ts' && ASSET_EXT.has(ext)) {
          copyAsset(full, srcDir, outDir);
        }
      }
    }
  }

  const result = runTscOnce(app);
  if (result !== 0) throw new Error(`[${app}] tsc 构建失败`);
  console.log(`[${app}] 构建完成 -> ${path.relative(root, outDir)}`);
}

function runTscOnce(app) {
  const appDir = path.join(root, `miniprogram-${app}`);
  const result = nodeSpawnSync(process.execPath, [tscJs, '-p', 'tsconfig.json'], {
    cwd: appDir,
    stdio: 'inherit'
  });
  return result.status ?? 1;
}

function runTscWatch(app) {
  const appDir = path.join(root, `miniprogram-${app}`);
  const args = [tscJs, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'];
  const child = spawn(process.execPath, args, { cwd: appDir, stdio: 'pipe' });
  child.stdout?.on('data', (d) => process.stdout.write(`[${app}:tsc] ${d}`));
  child.stderr?.on('data', (d) => process.stderr.write(`[${app}:tsc] ${d}`));
  return child;
}

function watchApp(app) {
  const appDir = path.join(root, `miniprogram-${app}`);
  const srcDir = path.join(appDir, 'src');
  const outDir = path.join(appDir, 'miniprogram');

  cleanOutDir(outDir);
  // 首次全量拷贝
  for (const file of walkFiles(srcDir)) {
    if (path.extname(file).toLowerCase() !== '.ts') copyAsset(file, srcDir, outDir);
  }
  runTscWatch(app);

  const watcher = chokidar.watch(srcDir, { ignoreInitial: true });
  watcher.on('add', (f) => path.extname(f) !== '.ts' && copyAsset(f, srcDir, outDir));
  watcher.on('change', (f) => path.extname(f) !== '.ts' && copyAsset(f, srcDir, outDir));
  watcher.on('unlink', (f) => path.extname(f) !== '.ts' && removeAsset(f, srcDir, outDir));
  console.log(`[${app}] watch 已启动（src -> miniprogram）`);
}

function* walkFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}

if (mode === '--build') {
  for (const app of apps) buildOnce(app);
} else {
  for (const app of apps) watchApp(app);
}
