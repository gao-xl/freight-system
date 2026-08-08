---
title: 代码评审与 DoD
prev: /dev/git-workflow
next: /dev/coding-backend
---

# 代码评审与 DoD

> 定义「一个改动何时算真正完成」。评审不是走过场，而是守住权限、数据隔离、金额精度、迁移安全这些红线的最后一道闸。

## 1. Definition of Done（DoD）

一个改动满足以下全部条件才算「完成」：

### 功能层
- [ ] 需求的核心场景已实现，且按 [决策表](/dev/index#决策表) 判断确实需要写代码（而非配置可解）
- [ ] 新接口返回格式符合约定 `{ code, message, data }`
- [ ] 前端页面能正常路由、渲染、保存

### 合规层（红线，评审重点）
- [ ] 新接口挂了 `guard(module, action)`，未绕过数据隔离（`scopedWhere` / `scopedFindOne`）
- [ ] 金额字段是 `DECIMAL(14,2)`，无 FLOAT
- [ ] 密钥存在 `IntegrationConfig` 表或环境变量，无硬编码
- [ ] 自动化/事件 handler 幂等 + 容错（`dedupKey` / 状态判断 / `try/catch`）
- [ ] 生产改表走了迁移，非 `seed.js`

### 质量层
- [ ] 单文件 ≤ 300 行，控制器逻辑下沉 service
- [ ] 有必要的测试（至少核心变更不破坏现有冒烟）
- [ ] CI 通过（后端 `npm test` + 前端 `npm run build`）

### 收尾层
- [ ] 提交信息符合 [Conventional Commits](/dev/git-workflow#提交信息规范)
- [ ] 相关文档已同步（本 wiki 或 README）

## 2. 评审清单（评审人逐项核对）

评审时优先查「会出事的地方」，而不是吹毛求疵：

| 关注点 | 检查项 |
|--------|--------|
| 数据隔离 | 新接口是否用了 `scopedWhere`？有没有 `Model.findAll({ where: req.query })` 裸查？ |
| 权限 | 路由是否挂了 `guard`？`protectedFields` 是否覆盖了系统字段？ |
| 金额 | 是否有 `FLOAT` / `Number` 直接存金额？ |
| 密钥 | 有没有把 apiKey/secret 写死在代码里？ |
| 幂等 | 自动化/事件处理是否可能重复执行？有无 `dedupKey`？ |
| 迁移 | 是否改了已发布的迁移文件？新迁移是否幂等？ |
| 事务 | 跨表写操作是否用了 `withTransaction`？ |
| 事件 | handler 是否 try/catch？是否可 `onAsync`？ |
| 代码结构 | 单文件是否过长？逻辑是否该下沉 service？ |

## 3. 评审通过标准

- **必须项全部通过**（合规层 + CI）
- 建议项（质量层）可以留待后续，但要明确记录
- 存在任何红线违规 → **打回**，不合并

## 4. 评审流程

```
开发完成 → 自查（DoD 清单）→ push 分支 → 发起 PR
  → CI 自动跑（后端冒烟 + 前端构建）
  → 评审人按清单核对 → 必项通过则合并到 dev
```

> 评审人的职责是「堵住红线」，不是「挑排版」。若评审意见集中在红线与正确性之外，说明评审标准需要回看本节。

## 下一步

进入 [后端规范](/dev/coding-backend) 与 [前端规范](/dev/coding-frontend)，了解具体编码标准。