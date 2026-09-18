# ADR-0016: 店员代顾客管理 + 手机号+短码登录

## Status

Accepted（替代 ADR-0013「顾客：OpenID + 手机号」方案中顾客自助注册环节）

## Date

2026-09-18

## Context

### 触发条件

在 Phase 3 收尾真机测试时发现：当前小程序 AppID `wxb7550c08b6411e2e` 是**个人主体小程序**，无法使用 `wx.getPhoneNumber` 授权组件（该 API 需小程序主体为「非个人」且申请「商业服务」类目）。这导致 ADR-0013 中设计的「顾客自助注册 = 邀请码 + 微信授权 + 手机号授权」流程在注册最后一步必失败。

### 用户的新需求

顾客端功能定位**重新调整为简化版**：

1. 顾客端**只保留手机号登录查看余额**的能力
2. 后续会加：**推送菜品推荐** + **推送优惠活动**
3. 顾客不自助注册 —— 由店员或店主导入顾客档案（线下扫码点餐时一并录入）

### 关键约束

- 不发短信验证码（资质成本）
- 不用 getPhoneNumber API（个人主体不支持）
- 不用 unionID/openid 作为顾客端身份（顾客不下载/扫码也能登录）
- 凭证必须可由人记忆 / 输入（首屏只让顾客填两项即可）

## Decision

### 1. 店员/店主代录入顾客档案

- 管理端新增「顾客管理」页面，店员或店主导入顾客档案
- 录入字段：**手机号**（11 位）+ 可选邀请人
- 后端 `adminCreateCustomer` 云函数：
  - 调用者必须是 owner / clerk（基于 `wxContext.openid` 校验角色）
  - 同一手机号已存在则**幂等返回已存在顾客**（防重复录入）
  - 为新顾客分配一个**4 位数字短码**（`customerCode`）
  - 写 audit log
- 店员口头把短码告诉顾客（4 位数字易记忆/传递）

### 2. 4 位顾客短码（customerCode）

- **生成规则**：`packages/shared/src/customerCode.ts` 用 `crypto.randomBytes(4)` 取模，从字符集 `123456789`（9 个）取 4 位
  - 编码空间 = 9^4 = **6561** 种组合
  - 同一店内顾客 > 6561 后生成碰撞概率显著上升，靠**唯一索引 + 重试 50 次**保证不重复
- **存储**：`customers` 集合加 `customerCode: string` 字段；加**唯一索引**（同一店同短码必须唯一；店内场景靠门店维度隔离即可）
- **首期规模假设**：单店顾客 < 500 人，6561 空间充裕；超 500 后视业务再扩位到 5 位（ADR 之外的 `customerCode.ts` 单文件改动）
- **角色标记**：仅 `role: "customer"` 持有 `customerCode`；owner / clerk 不持有

### 3. 顾客登录凭证：手机号 + 4 位短码

- 前端首次登录：顾客填两项（手机号 + 短码）→ 调 `customerLogin` 云函数
- 后端校验：
  - `phoneHash = SHA256(phone + GLOBAL_SALT)` 查 customer
  - 比对 `customerCode` 字段
  - 进程内 Map 防爆破：**连续 5 次失败锁 1 小时**（按 phoneHash 维度）
  - 成功 → 返回 `{ customerId, customerCode, phoneMask }`
  - 写 inbox `PHONE_BOUND` 通知
- 前端本地缓存：`wx.storage.set('customer_login', { phone, customerCode })`
- 后续云函数调用（`getMyBalance` / `getMyOrders`）每次都回传 `{ phone, customerCode }`，**云函数每次都校验**（无 token、无 openid 暴露）

### 4. 推送菜品推荐 / 优惠活动的扩展点

- `customers._id` 即 `customerId`，是后续推送的目标 ID
- 菜品推荐走 `inbox_messages`（站内 inbox）
- 优惠活动推送走「订阅消息」（需顾客在小程序内主动 subscribe），计 `daily_push_counters`
- 此 ADR 仅记录顾客**身份获取方式**，推送通道实现见 ADR-0014

## 变更涉及文件

| 类别 | 文件 | 变更 |
|---|---|---|
| 云函数 handler | `auth/src/handlers/adminCreateCustomer.ts` | 新建 |
| 云函数 handler | `auth/src/handlers/customerLogin.ts` | 新建 |
| 云函数 handler | `auth/src/handlers/getMyBalance.ts` | 新建 |
| 云函数 handler | `auth/src/handlers/getMyOrders.ts` | 新建 |
| 云函数 handler | `auth/src/handlers/checkRegisterState.ts` | 删除（顾客不再自助注册，无需查询注册状态） |
| 路由 | `auth/src/index.ts` | 删 `checkRegisterState` / `registerCustomer` / `createCustomerInvite` / `getMyInviteCode` 4 个 case；新增 4 个顾客相关 case |
| 类型 | `auth/src/shared/types.ts` | `Customer` 加 `customerCode?: string`；新增 `CustomerSessionInfo` |
| 工具 | `auth/src/shared/customerCode.ts` | 新建（4 位数字短码生成 + 唯一性重试） |
| 错误码 | `auth/src/shared/errors.ts` | 加 `CUSTOMER_NOT_FOUND` / `CUSTOMER_CREDENTIAL_INVALID` / `INVALID_ROLE_FOR_ADMIN_CREATE` / `INVALID_PHONE_FORMAT` |
| 常量 | `packages/shared/src/constants.ts` | 加 `CUSTOMER_CODE_LENGTH=4` / `CUSTOMER_LOGIN_STORAGE_KEY='customer_login'` |
| 顾客端页面 | `miniprogram-customer/pages/register/` | 删除（4 文件） |
| 顾客端页面 | `miniprogram-customer/pages/customer-login/` | 新建（手机号+短码登录页） |
| 顾客端页面 | `miniprogram-customer/pages/index/index.{js,wxml,wxss}` | 改用 `customerLogin`；展示余额卡 + 订单概览；去邀请码/个人中心网格 |
| 顾客端 utils | `miniprogram-customer/utils/session.js` | 删除（被 `customer-auth.js` 替代） |
| 顾客端 utils | `miniprogram-customer/utils/customer-auth.js` | 新建（手机号+短码凭证读写 + `callAuth` 封装） |
| 顾客端入口 | `miniprogram-customer/app.{js,json}` | 改 `globalData.customerLogin`；删 invite/profile/register 路由 |
| 数据库 | `customers` 集合 | 加 `customerCode` 唯一索引 |

## Consequences

- (+) **个人主体小程序也能上线**：不依赖 getPhoneNumber API
- (+) **顾客端零摩擦登录**：只填两项（11 位手机号 + 4 位数字），无验证码、无 OAuth
- (+) **店员对顾客账号有可见可控录入**：和线下扫码点餐流程顺其自然
- (+) **推送功能可平滑扩展**：`customerId` 是稳定 ID，后续菜品推荐/优惠推送直接投递
- (+) **隐私更友好**：顾客端不持有 openid，云函数每次按手机号+短码校验，开放程度更低
- (-) **顾客自助注册消失**：所有新客必须由店员/店主导入，店外场景无法走纯顾客路径
- (-) **手机号明文传输**：登录时明文走 HTTPS 到云函数，云函数算 `phoneHash` 后只存哈希（明文不落库）
- (-) **短码 6561 空间**：单店 500 内充裕；超大店需扩位
- (-) **防爆破用进程内 Map**：在云函数**多实例**部署下不是严格全局锁。足够个人小程序规模；严格方案需换 Redis / 云数据库计数（后续规模到时升级）
- (-) **找回短码成本**：顾客忘记短码只能找店员或店主重置（首期允许 admin 重置）

## Known Risks

- **短码碰撞**：编码空间 6561，店内顾客 < 500 时碰撞概率 < 5%（生日悖论），靠唯一索引 + 重试 50 次兜底
- **手机号明文传输**：HTTPS 加密；云函数 `GLOBAL_SALT` 走环境变量；如果云函数被入侵，`phoneHash` 可被离线爆破（盐在 env 中泄露时）
- **进程内防爆破**：多实例下不严格；后续加 `customers` 集合的 `failedLoginCount` / `loginLockedUntil` 字段可持久化
- **顾客多端登录**：当前不做多端互踢（无 token 模型）；若顾客在小程序 A 改短码，小程序 B 仍能登录旧短码 —— 短码重置走店员路径
- **getPhoneNumber API 不在路径中**：未来若商家升级到「企业主体小程序」，可加 SMS + getPhoneNumber 双通道；本 ADR 不阻止