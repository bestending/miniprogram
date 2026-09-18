# ADR-0011: 小程序端选型(原生 TS + Vant Weapp)

## Status
Accepted

## Date
2026-09-18

## Context
小程序分为两个独立 appid(顾客端 + 管理端),共享微信开放平台 unionID 体系。前端技术栈需要在三个维度选择:

### UI 框架
- (a) 原生 + 手写 wxss(最小依赖)
- (b) 原生 + **Vant Weapp 1.x**(成熟组件库,移动端体验最好)
- (c) Taro 3.x(React 多端)
- (d) uni-app(Vue 多端)

### 语言
- (a) JavaScript
- (b) **TypeScript 5**(类型安全 + 与后端共用类型)
- (c) Flow

### 状态管理
- (a) 原生 Page.data(简单页面够)
- (b) **Mobx-miniprogram**(轻量响应式)
- (c) 原生 + 自写 Store 类
- (d) Redux / Zustand(过度)

## Decision
确定三件套:
- **UI 框架**:**Vant Weapp 1.11+**(组件覆盖 90% 场景,口碑最稳)
- **语言**:**TypeScript 5** + `miniprogram-api-typings`
- **状态管理**:**Mobx-miniprogram**(余额、订单列表、邀请码状态等需要响应的场景用 Store;简单表单仍用 Page.data)

### 双小程序如何共享代码

```
┌─ miniprogram-customer/  (顾客端 appid,版本审核)
│   ├─ src/
│   └─ 引用 → packages/shared
│
├─ miniprogram-staff/    (管理端 appid,版本审核)
│   ├─ src/
│   └─ 引用 → packages/shared
│
└─ packages/shared/      (TS 类型 + 工具函数 + 常量)
    ├─ types.ts          (Customer, Order, RebateCode, RebateWindow...)
    ├─ constants.ts      (DEFAULT_REBATE_RATE, WITHDRAW_THRESHOLD...)
    ├─ utils/            (日期、金额、邀请码生成器)
    └─ validators/       (手机号、金额校验)
```

`packages/shared` 通过 npm 本地依赖(`"shared": "file:../packages/shared"`)+ TypeScript path mapping,在两个小程序中无缝复用。

### 关键页面规划

| 顾客端 | 用途 | 关键交互 |
|---|---|---|
| 首页 | 收款码 + 邀请码领取入口 | wx.scanCode / 主动出示 |
| 邀请码详情 | 显示我的码 + 「分享给好友」 | onShareAppMessage |
| 返利余额 | 可用 / 待定 / 即将过期 | 列表 + 提现按钮 |
| 提现申请 | 输入金额 → 提交审核 | 表单 + 微信手机号授权 |
| 订单记录 | 我的全部消费 | 状态机渲染 |
| 个人中心 | 手机号绑定 / 隐私设置 | wx.getPhoneNumber |

| 管理端 | 用途 | 关键交互 |
|---|---|---|
| 登录 | 店主邀请码验证 / 店员密码登录 | 一次性绑定,后端校验身份 |
| 实时看板 | 当日营业额 / 返利支出 / 待审核 | auto refresh(30s) |
| 节假日配置 | 日历选择 + 比例设置 | 增删改 + 一键复制上月 |
| 提现审核 | 列表 + 通过 / 拒绝 | 调用云函数调企业付款 |
| 邀请人排行 | TOP50 + 检索 | 月度筛选 + CSV 导出 |
| 审计日志 | 谁在何时做了什么 | 仅店主可见,只读 |

## Consequences
- (+) **TS 类型共享**:后端云函数返回 `Order` 时,前端无需手抄类型,IDE 自动补全
- (+) **Vant Weapp 调试链路短**:无 Babel、无 loader,微信开发者工具原生支持
- (+) **Mobx-minipropack 包体积小**(~12 KB gzipped)
- (+) **双小程序共享 80% 类型/工具代码**
- (-) **Vant Weapp 与微信原生样式偶有冲突**:需要按需覆盖 wxss,deep 选择器
- (-) **Mobx-miniprogram 不支持 decorators**(需用 `makeAutoObservable` 普通函数写法)
- (-) **双小程序仍需手动维护两份目录**:不同 appid 的 `app.json` / `project.config.json` 不可合并

## Known Risks
- **店主自配上限降级风险**:Vant Weapp 自定义组件嵌套深时,样式覆盖难——首期保持简单页面
- **TS 编译速度**:小程序项目小,首次 < 5s,可接受
- **云函数返回类型同步**:若后端改了字段,需手动跑 `tsc --noEmit` 校验,CI 加一步