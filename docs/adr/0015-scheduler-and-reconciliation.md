# ADR-0015: 定时任务与对账

## Status
Accepted

## Date
2026-09-18

## Context
返利系统的「准点性」与「容错性」是核心品质。需要 4 类定时任务支撑业务运转:

| 任务 | 触发时机 | 业务含义 |
|---|---|---|
| **T+7 返利计入** | 订单核销后第 7 天 | 把「待定金额」从订单转到返利余额 |
| **节假日活动日终检** | 每日 23:59 | 检查当天订单是否落在返利窗口内 |
| **即将过期预警** | 每日 02:30 | 余额 90 天到期前 7 天推送顾客 |
| **日终自动对账** | 每日 03:00 | 校验返利流水、余额变动、企业付款三者一致 |

候选方案:
- (a) **每日 02:00 全量扫描**(已选 T+7)
- (b) 每笔订单倒计时
- (c) 每日 02:00 主扫 + 实时补偿
- (d) 实时计入

对账策略(已选 b):
- (a) 仅日志
- (b) **日终自动对账 + 差异告警**(已选)
- (c) 自动修复 + 日终 + 日报
- (d) 实时差异告警 + 修复

## Decision

### 定时任务编排(微信云开发定时触发器)

| 触发器名 | Cron 表达式 | 实现云函数 | 耗时预估 | 备注 |
|---|---|---|---|---|
| `rebate-credit-tick` | `0 2 * * *` | `creditT7` | < 30s | 全量扫 T+7 订单 |
| `expiring-soon-tick` | `30 2 * * *` | `notifyExpiring` | < 60s | 余额 90 天到期前 7 天预警 |
| `reconcile-tick` | `0 3 * * *` | `reconcileDaily` | < 60s | 日终对账 |
| `monthly-window-tick` | `0 0 14 * *` | `windowMonthlyPre` | < 10s | 月 14 日 00:00 检查次日是否月 15 |
| `monthly-aggregate-tick` | `0 1 16 * *` | `aggregateMonthly` | < 60s | 月 16 日 01:00 聚合上月榜单 |
| `top10-refresh-tick` | `0 4 * * *` | `refreshTop10Cache` | < 30s | 每日 04:00 刷新 TOP10 缓存 |
| `heartbeat-ping` | `*/5 * * * *` | `warmup` | < 1s | 每 5 分钟 ping,防冷启动 |

> **⚠️ 已知平台限制冲突(待评估)**:微信云开发**免费版定时触发器每日上限 50 次**,而 `heartbeat-ping` 每 5 分钟一次 = **288 次/日**,严重超限。
>
> **当前处理**:**暂不修改设计,在项目实施时评估**。可选缓解方案(后续讨论):
> - (a) 去掉 heartbeat-ping,接受首次冷启动 200~500ms 延迟
> - (b) 升级到付费版云开发(基础版 19.9 元/月,上限提升到 5000 次/日)
> - (c) 改用客户端 warmup(顾客进小程序时调一次云函数,不占触发器额度)
> - (d) b + c 组合
>
> 业务量起步阶段(< 1000 日活)冷启动可接受,首期可先用方案 (a);日活过 1k 后再评估升级。

### T+7 计入实现(`creditT7`)

```typescript
// pseudocode
export async function creditT7() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;  // 7 天前
  const orders = await db.collection('orders').where({
    verifyTime: _.lt(cutoff),
    rebateStatus: 'pending',
    refundStatus: _.neq('full_refund')
  }).get();

  for (const order of orders.data) {
    // 乐观锁:只更新扣 atomic load
    const result = await db.collection('orders').where({
      _id: order._id,
      version: order.version
    }).update({
      data: {
        rebateStatus: 'confirmed',
        version: _.inc(1),
        confirmedAt: Date.now()
      }
    });

    if (result.updated === 0) continue;  // 并发跳过

    // 增加返利余额(事务)
    await db.runTransaction(async transaction => {
      const balance = await transaction.collection('rebate_balances').doc(order.whereCustomerId).get();
      const newAvailable = balance.available + order.rebateAmount;
      const newPending = Math.max(0, balance.pending - order.rebateAmount);
      // 90 天有效期(从确认日开始)
      const expireAt = Date.now() + 90 * 24 * 60 * 60 * 1000;
      await transaction.collection('rebate_balances').doc(order.whereCustomerId).update({
        data: {
          available: newAvailable,
          pending: newPending,
          expireSoonList: _.push([{ amount: order.rebateAmount, expireAt }])
        }
      });
    });

    // 推送事件(详见 ADR-0014)
    await pushRebateCredited(order);
}
```

### 月 15 日返利窗口触发(`windowMonthlyPre` + 实时判定)

- 月 14 日 00:00 触发 `windowMonthlyPre`,在 `rebate_windows` 集合自动插入 / 更新次日 0:00~23:59 的「月度返利日」记录
- 订单创建时实时判定 `payTime` 是否落在 `rebate_windows.startAt ~ endAt` 内,匹配则按配置的 `rebateRate` 计算
- 节假日与月15日重合:`rebateRate` 取较高值(已在 ADR-0004 中明确)

### 月度聚合(`aggregateMonthly`)

每月 16 日 01:00(给上次月数据 1 天结算缓冲):
1. 按 `inviterId` 聚合上月返利金额 → 写入 `monthly_aggregates` 集合
2. 刷新 `top10_cache` 集合(管理端首页看板读这个,避免每次现算)
3. 生成店主上月经营报告(见 ADR-0008)→ 推送给店主

### 日终对账(`reconcileDaily`)

```
┌────────────────────────────────────────────────────────┐
│ 三对账源:                                              │
│   A. orders 集合: 返利状态 = confirmed 的订单          │
│   B. rebate_balances: 每用户的 pending / available 累计 │
│   C. withdraw_requests: 状态 = paid 的提现记录          │
│                                                        │
│ 对账公式(每日 03:00):                                 │
│   Σ(A),rebate.amount === Σ(B).confirmed_today         │
│                                                        │
│   Σ(B).available == Σ(C).paid_today - 提现手续费        │
│                                                        │
│ 差异阈值:¥1                                    │
│ 超出阈值:                                              │
│   1. 写 audit_logs(diff_record)                       │
│   2. 推送给店主订阅消息 REKONCILE_ALERT                │
│   3. 不自动修复(人工排查)                             │
└────────────────────────────────────────────────────────┘
```

### 即将过期预警(`notifyExpiring`)

每日 02:30 扫描 `rebate_balances` 集合:
- 读每条 `expireSoonList`,找出 `expireAt - Date.now() ∈ [0, 7 days]`
- 通过 `pushBalanceExpiring`(参考 ADR-0014)推送顾客
- 推送后把过期项标记 `notified: true`(避免重复推)

## Consequences
- (+) **准点性强**:T+7 误差 < 24 小时,月 15 日 0 点准时
- (+) **实现简单**:7 个定时触发器,全部是「批量读 + 批量改」,无并发出问题
- (+) **冷启动可控**:`heartbeat-ping` 每 5 分钟保活
- (+) **故障可观测**:日终对账自动暴露不一致
- (-) **微信云开发定时触发器只支持到分钟级**:月 15 日 0 点准时,但精确到分钟可
- (-) **T+7 单次批量最多 1000 订单**:超出会被截断,需要 `skip` 参数分批;首期业务量不会到
- (-) **月榜刷新需要 1 天延迟**:TOP10 是昨日数据(可接受)

## Known Risks
- **定时任务并发**:若云函数实例同时跑两个 `creditT7`,会用乐观锁 `version` 防止重复计入
- **微信云开发时区**:默认是 UTC,配置 cron 时已转为 `+8` 实际运行时间(`0 2 * * *` 是 UTC 10:00 = 北京时间 18:00);如需要 UTC,改为 `0 18 * * *`
- **节假日同步**:店主在管理端修改节假日,实时生效,但需要云函数高优先级调度;配置错误会造成“该返不返/不该返返了”,需要 audit_log 全量记录
- **日终对账差异 > 阈值**:首期只告警不修复,需要预设 SOP(店主 + 技术介入)