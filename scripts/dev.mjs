/**
 * 一键开发：并行启动 shared 类型编译监听 + 双小程序 src->miniprogram 监听。
 * 任一进程退出则整体退出；Ctrl+C 清理全部子进程。
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tscJs = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');

const children = [
  {
    tag: 'shared',
    args: [tscJs, '-p', 'packages/shared/tsconfig.json', '--watch', '--preserveWatchOutput'],
    cwd: root
  },
  {
    tag: 'customer',
    args: [path.join(root, 'scripts', 'build-mm.mjs'), '--watch', 'customer'],
    cwd: root
  },
  {
    tag: 'staff',
    args: [path.join(root, 'scripts', 'build-mm.mjs'), '--watch', 'staff'],
    cwd: root
  }
].map(({ tag, args, cwd }) => {
  const child = spawn(process.execPath, args, { cwd });
  const prefix = `[${tag}] `;
  child.stdout?.on('data', (d) => process.stdout.write(prefix + String(d).replace(/\n(?!$)/g, `\n${prefix}`)));
  child.stderr?.on('data', (d) => process.stderr.write(prefix + String(d).replace(/\n(?!$)/g, `\n${prefix}`)));
  child.on('exit', (code) => {
    console.error(`${prefix}退出（code ${code}），正在结束全部 watch 进程`);
    shutdown(code ?? 1);
  });
  return child;
});

function shutdown(code) {
  for (const child of children) child.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
