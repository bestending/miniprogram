# ADR-0012: 仓库结构与 CI/CD 流水线

## Status
Accepted

## Date
2026-09-18

## Context
项目涉及三个互相耦合又可独立部署的产物:
- 顾客端小程序(微信审核 appid-A)
- 管理端小程序(微信审核 appid-B)
- 后端云函数集合(微信云开发环境)

需要一个 monorepo 结构,既能代码复用,又能独立发布。

候选:
- (a) **npm workspaces + Lerna**(成熟、轻量、原生 npm)
- (b) pnpm + Turborepo(更快,但需要团队熟悉)
- (c) 每个产物一个独立仓库(无复用)
- (d) Nx(过重,小项目没必要)

## Decision
**采用 (a) npm workspaces + 简单脚本**(不上 Lerna,3 个 package 用 npm 自带 workspace 即可)。

### 仓库结构

```
invite-rebate-miniapp/
├── package.json              # root,workspaces 声明
├── tsconfig.base.json        # 公共 TS 配置
├── packages/
│   └── shared/               # 类型 / 工具 / 常量(无依赖)
│       ├── package.json
│       └── src/
│           ├── types.ts
│           ├── constants.ts
│           ├── validators/
│           └── utils/
├── miniprogram-customer/     # 顾客端
│   ├── package.json          # 依赖 shared 与 vant-weapp
│   ├── miniprogram/          # 微信原生目录
│   ├── src/                  # TS 源码
│   ├── project.config.json
│   └── tsconfig.json
├── miniprogram-staff/        # 管理端
│   ├── package.json
│   ├── miniprogram/
│   ├── src/
│   ├── project.config.json
│   └── tsconfig.json
├── cloudfunctions/           # 微信云函数集合
│   ├── rebate/               # 邀请码核销主云函数
│   ├── notify/               # 客服消息通知
│   ├── withdraw/             # 提现审核
│   ├── daily-task/           # T+7 定时 + 月度聚合
│   ├── export/               # CSV 导出
│   └── shared/               # 云函数侧共享工具(不依赖 npm)
├── docs/
│   └── adr/                  # 12 个 ADR 文档
├── ARCHITECTURE.md           # 给甲方的演示文档
├── CONTEXT.md                # 领域词汇表
├── render.html               # PDF 渲染模板
└── README.md
```

### CI/CD 流水线

3 套流水线,各自独立:

| 流水线 | 触发 | 操作 | 目标 |
|---|---|---|---|
| **CI 类型检查** | PR push | `tsc --noEmit` 三个 package + lint | GitHub Check |
| **云函数部署** | push `main` 改 `cloudfunctions/**` | `tcb fn deploy <node> --force` | 云开发环境(默认环境) |
| **小程序体验版** | push `main` 改 `miniprogram-*/src/**` | `miniprogram-ci` 上传体验版 | 微信小程序后台 |

候选 CI 服务:
- (a) **GitHub Actions**(免费 2000 分钟/月,够用)
- (b) 微信云开发的 webhook 触发(只能做云函数)
- (c) Gitee Go(国内访问快但生态弱)

**Decision**:**GitHub Actions + 微信 miniprogram-ci CLI**(官方推荐,文档清晰)。

### 微信云开发环境

单环境(`default`)足够:
- 不区分 prod / staging(小项目)
- 每次 PR 跑集成测试用 `tcb fn run --params` 命令直接调用云函数
- 出问题回滚靠 `tcb fn history` + 手动 `tcb fn rollback`

## Consequences
- (+) **共享代码零成本**:3 个 package 都 `import { RebateCode } from 'shared'`
- (+) **CI 完整覆盖**:类型检查 + 体验版上传 + 云函数部署一条龙
- (+) **可独立发布**:顾客端体验版可以先行,管理端稍后再上
- (-) **npm workspaces 嵌套依赖偶有坑**:需要在 root 装 `typescript` 后,各 package 用 root 的版本
- (-) **微信云开发没有 staging 环境**:测试时直接打 prod 体验版,有风险——靠 GitHub PR review + 单元测试兜底
- (-) **云函数冷启动**:CI 部署后第一次 hit 慢,定时 ping 是必备(见 ADR-0009)

## Known Risks
- **微信小程序审核需 1~3 天**:大改前预留缓冲期
- **云函数部署失败**:已加 `--force`,失败时 CI 红色提醒但不阻塞其他 package
- **TS 类型定义跨仓库**:目前「packages/shared」是本地 file:依赖,未来若拆仓,要改成 npm private registry——首期不需要