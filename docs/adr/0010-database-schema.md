# ADR-0010: 数据库与集合结构(微信云数据库)

## Status
Accepted

## Date
2026-09-18

## Context
微信云开发数据库是类 MongoDB 的文档型存储(NoSQL),不支持跨集合事务(2024 年起逐步支持 server-side transaction),不支持 SQL JOIN。要在文档模型上表达:
- 顾客身份(微信 OpenID + 手机号)
- 邀请码生命周期(已领取 / 已绑定 / 已使用 / 已失效)
- 返利余额(随订单累积、可提现、有有效期)
- 订单状态机(已支付 → 已核销 → T+7 → 已计入 / 已退款扣除)
- 节假日活动配置(店主自配)
- 提现申请(待审核 / 已通过 / 已打款 / 已拒绝)
- 审核日志(谁在何时做了什么)

候选方案:
- (a) 全部按文档型单集合 + 嵌套数组(避免 JOIN)
- (b) 多集合关联 + 反范式冗余字段(查询快、写入复杂)
- (c) 关系型数据库(自建 MySQL / 云开发 MySQL 适配)
- (d) 文档型 + 冗余+事务关键操作加锁

## Decision
**采用 (d) 文档型 + 冗余字段 + 关键操作乐观锁**。

### 集合设计(7 张主表)

| 集合名 | 作用 | 关键字段 | 索引 |
|---|---|---|---|
| `customers` | 顾客身份 | `_id`, `openid`, `unionid`, `phoneHash`(SHA256), `customerCode`(4位,仅顾客), `nickName`, `inviterId`, `createdAt` | `openid`(唯一), `phoneHash`(唯一), `customerCode`(唯一,仅 role=customer 有值), `inviterId` |
| `rebate_codes` | 邀请码生命周期 | `_id`, `code`(6 位),`inviterId`, `newbieId`(绑定后填), `status`(`active`/`bound`/`used`/`expired`), `createdAt`, `boundAt`, `usedAt` | `code`(唯一), `inviterId`, `status` |
| `orders` | 订单状态机 | `_id`, `orderNo`, `amount`, `newbieId`, `inviterId`, `codeId`, `payTime`, `verifyTime`, `rebateAmount`(待定), `rebateStatus`(`pending`/`confirmed`/`refunded`), `rebateWindowId`, `version`(乐观锁) | `orderNo`(唯一), `newbieId`, `inviterId`, `rebateStatus` |
| `rebate_balances` | 返利余额(按邀请人聚合) | `_id`, `customerId`, `available`(可用), `pending`(T+7 中), `frozen`(过期前锁定), `expireSoonList`(90 天过期列表), `updatedAt` | `customerId`(唯一) |
| `rebate_windows` | 节假日活动配置 | `_id`, `storeId`, `type`(`holiday`/`monthly_15`), `name`, `startAt`, `endAt`, `rebateRate`, `enabled`, `createdBy` | `storeId`, `(startAt, endAt)` 复合 |
| `withdraw_requests` | 提现申请 | `_id`, `customerId`, `amount`, `status`(`pending`/`approved`/`paid`/`rejected`), `monthUsed`(当月已用), `submittedAt`, `reviewedAt`, `reviewedBy`, `wxTransferId` | `customerId`, `status` |
| `audit_logs` | 审核日志(不可改) | `_id`, `actorId`, `actorRole`(`owner`/`clerk`), `action`, `targetType`, `targetId`, `payload`, `createdAt` | `(actorId, createdAt)` 复合 |

### 关键设计取舍

1. **手机号只存哈希**:`phoneHash = SHA256(phone + salt)`,防泄漏
2. **邀请链冗余到 orders**:`inviterId` 写在订单上,避免查 rebate_codes 二次回溯
3. **返利金额写在 orders 上**:`rebateAmount` 锁定后变成 immutable,只通过状态机推进
4. **余额拆分 available / pending / frozen**:支持 T+7 缓冲期可视化、不并发扣减争议
5. **乐观锁 version**:返利状态机推进用 `db.collection.update({_id, version}, {$set: {...}, $inc: {version: 1}})`,失败重试 1 次

### 反作弊四件套落点(承接 ADR-0003)

| 反作弊规则 | 落点集合 | 校验字段 |
|---|---|---|
| 首单领码 | `customers.createdAt` | 全集合单次绑定校验 |
| 一次绑定 | `rebate_codes.newbieId` | 一旦非 null 即拒 |
| 限额 | `withdraw_requests.monthUsed` | 当月累计聚合 |
| 同设备硬互斥 | `customers.deviceId`(首登记) | 同一 deviceId 全部拒单 |

## Consequences
- (+) **查询场景覆盖**:邀请码 TOP10、月度返利排行、店主财务看板都可通过单集合或 2 个集合完成,无 JOIN 需求
- (+) **写入路径短**:订单创建 → 状态机推进 → 余额累加,都在云函数本地完成,无跨服务调用
- (+) **乐观锁避免重复计入**:T+7 定时任务多实例并发也不会双倍计入
- (-) **跨集合聚合需要云函数手写**:月榜 TOP10 不能用 SQL 一次出,要在云函数里 `for + sort`
- (-) **余额需要谨慎并发**:同一邀请人多次返利可能同时触发余额累加,乐观锁 + 重试是兜底
- (-) **未来扩 SaaS 多租户**:需要在每张集合上加 `storeId`,且所有索引重建——这是已知技术债

## Known Risks
- **店主审核自己提现**:见 ADR-0007,首期接受
- **节假日活动多店重叠**:目前 `storeId` 已在 `rebate_windows`,需要店主侧按 storeId 过滤;后续转 SaaS 时直接复用
- **审计日志膨胀**:`audit_logs` 默认保留 12 个月,过期转冷存储(云存储 OSS)+ Elasticsearch,首期不需要