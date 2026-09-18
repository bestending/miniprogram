/**
 * 为两个小程序创建本地 node_modules 目录联接（postinstall 自动执行）。
 *
 * 背景：根仓库使用 npm workspaces，依赖被提升到根 node_modules，
 * 而微信开发者工具「构建 npm」与 miniprogram-ci 的 packNpmManually
 * 都从各小程序自己的 package.json 旁查找 node_modules。
 * 这里把实际依赖以 junction（Windows）/ symlink（POSIX）链入，
 * 使各小程序目录下的 node_modules 可被识别为本地依赖目录。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const symlinkType = isWin ? 'junction' : 'dir';

const links = [
  { name: '@vant/weapp', target: path.join(root, 'node_modules', '@vant', 'weapp') },
  { name: 'mobx-miniprogram', target: path.join(root, 'node_modules', 'mobx-miniprogram') },
  { name: 'shared', target: path.join(root, 'packages', 'shared') }
];

function ensureLink(linkPath, target) {
  if (fs.existsSync(linkPath) || fs.existsSync(`${linkPath}${isWin ? '' : ''}`)) {
    let current;
    try {
      current = fs.readlinkSync(linkPath);
    } catch {
      return; // 非链接的真实目录/文件（如用户手动安装），保持不动
    }
    if (path.resolve(path.dirname(linkPath), current) === path.resolve(target) || current === target) {
      return;
    }
    fs.rmSync(linkPath, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath, symlinkType);
  console.log(`[link-mm] ${path.relative(root, linkPath)} -> ${path.relative(root, target)}`);
}

for (const app of ['customer', 'staff']) {
  const base = path.join(root, 'miniprogram-' + app, 'node_modules');
  for (const { name, target } of links) {
    if (!fs.existsSync(target)) {
      console.warn(`[link-mm] 跳过 ${name}：目标尚不存在（${path.relative(root, target)}），请先完成 npm install`);
      continue;
    }
    ensureLink(path.join(base, name), target);
  }
}
