# invite-rebate-miniapp

餐饮邀请码返利小程序 monorepo：顾客端小程序（appid-A）+ 管理端小程序（appid-B）+ 微信云开发云函数。

架构与决策见 [ARCHITECTURE.md](./ARCHITECTURE.md)、领域术语见 [CONTEXT.md](./CONTEXT.md)、决策记录见 [docs/adr/](./docs/adr/)（仓库与 CI/CD 见 [ADR-0012](./docs/adr/0012-repo-and-cicd.md)）。

## 环境要求

- Node.js 20（见 `.nvmrc`）
- npm（workspaces，不引入 Lerna/pnpm）
- 微信开发者工具（稳定版）

## 快速开始

```bash
npm install          # 安装根依赖并自动联接小程序本地 node_modules（postinstall）
npm run build:shared # 先产出 shared 编译产物（双小程序依赖其类型）
npm run dev          # 开发模式：shared + 双小程序 watch
```

用微信开发者工具分别导入 `miniprogram-customer/` 与 `miniprogram-staff/` 两个目录，并在工具中执行一次「工具 → 构建 npm」（生成 `miniprogram_npm`，已被 gitignore）。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 并行启动 shared 与双小程序的 watch（src → miniprogram） |
| `npm run build` | 全量构建：shared → 双小程序 → 云函数 |
| `npm run build:shared` | 仅编译 packages/shared 到 dist |
| `npm run build:mm` | 构建两个小程序（可指定：`node scripts/build-mm.mjs --build customer`） |
| `npm run build:cloud` | 编译 8 个云函数并铺 shared 到各函数目录 |
| `npm run typecheck` | 全部 package `tsc --noEmit` |
| `npm run lint` | ESLint 9 flat config |
| `npm run upload:mm -- customer` | miniprogram-ci 上传顾客端体验版（需密钥环境变量） |

## 目录结构

```
packages/shared/          领域类型 / 常量 / 校验器 / 工具（编译 dist 供三端消费）
miniprogram-customer/     顾客端：src/(TS 源) → miniprogram/(编译产物，gitignored)
miniprogram-staff/        管理端：同上
cloudfunctions/
  ├─ auth/                店主激活 / 店员绑定 / 顾客注册（ADR-0013）
  ├─ rebate/              邀请码与返利计算（ADR-0001~0004）
  ├─ notify/              订阅消息 + 站内消息（ADR-0014）
  ├─ withdraw/            提现与企业付款（ADR-0005）
  ├─ payment/             微信支付 v3 下单/退款/回调（ADR-0002）
  ├─ daily-task/          5 个定时触发器（T+7/到期预警/月窗口/月聚合/TOP10，ADR-0015）
  ├─ reconcile/           日终对账触发器（ADR-0015）
  ├─ export/              CSV 导出（ADR-0008）
  └─ shared/              云函数侧纯 JS 共享工具（构建时拷入各函数，不依赖 npm）
scripts/                  构建、watch、类型检查、上传体验版脚本
.github/workflows/        CI 类型检查/lint、云函数部署、小程序体验版上传
```

页面清单以 ADR-0011 为准：顾客端 6 页（首页 / 邀请码详情 / 返利余额 / 提现申请 / 订单记录 / 个人中心），管理端 6 页（登录 / 实时看板 / 节假日配置 / 提现审核 / 邀请人排行 / 审计日志），均已注册为可编译空壳；tabBar 图标待设计资源补充后配置。

## 部署前必须替换的占位

| 位置 | 占位 | 如何获取 |
|---|---|---|
| `cloudbaserc.json` | `YOUR_ENV_ID` | 云开发控制台环境 ID（首期单环境） |
| `miniprogram-customer/project.config.json` | `touristappid` | 顾客端 appid（appid-A） |
| `miniprogram-staff/project.config.json` | `touristappid` | 管理端 appid（appid-B） |
| GitHub Variables | `ENV_ID`、`WX_CUSTOMER_APPID`、`WX_STAFF_APPID` | repo Settings → Variables |
| GitHub Secrets | `TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY` | 腾讯云 API 密钥（部署云函数） |
| GitHub Secrets | `WX_CUSTOMER_PRIVATE_KEY`、`WX_STAFF_PRIVATE_KEY` | 两小程序后台「开发设置」上传代码私钥（PEM 全文） |

## 定时触发器时区说明

`daily-task/config.json` 与 `reconcile/config.json` 中的 cron 为 SCF 的 7 位 UTC 表达式，已按 [ADR-0015](./docs/adr/0015-scheduler-and-reconciliation.md) 的时区注释换算为北京时间（如北京 02:00 = UTC 18:00）。首期未注册 heartbeat-ping（免费版 50 次/日限制，ADR-0009 限制 1）。
