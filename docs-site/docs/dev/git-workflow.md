---
title: Git 与分支规范
prev: /dev/quickstart
next: /dev/code-review
---

# Git 与分支规范

> 统一的分支模型与提交纪律，是所有协作开发的前提。本节定义分支命名、提交信息格式、合并流程与红线。

## 1. 分支模型

```
main                       生产分支（可部署，受保护，禁止直接 push）
  └─ dev                   集成分支（所有功能合并到这里，触发 CI）
       ├─ feat/xxx         功能分支（从 dev 切出）
       ├─ fix/xxx          修复分支
       └─ docs/xxx         文档分支
```

| 分支 | 用途 | 规则 |
|------|------|------|
| `main` | 生产 | 受保护，禁止直接 push；只能从 dev 或 release 合并 |
| `dev` | 集成 | 所有功能合入点，push 触发 CI |
| `feat/<name>` | 功能 | 从 `dev` 切出，完成后合并回 `dev` |
| `fix/<name>` | 修复 | 从 `dev` 切出，紧急修复可从 `main` 切出并回合 |
| `docs/<name>` | 文档 | 本 wiki 的改动也走分支 + PR |

## 2. 提交信息规范

采用 Conventional Commits，格式：

```
<type>(<scope>): <subject>

<body 可选>
```

| type | 含义 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复缺陷 |
| `docs` | 文档（本 wiki 用） |
| `refactor` | 重构（不改变行为） |
| `perf` | 性能优化 |
| `test` | 测试 |
| `chore` | 构建/工具/依赖 |
| `migrate` | 数据库迁移 |

示例：

```
feat(quotation): 报价新增毛利预览
fix(order): 修复派生状态在空节点时的空指针
docs(dev): 新增 Git 与分支规范
migrate: 新增 business-rules 表
```

## 3. 分支命名规范

- 统一小写 + `-` 连接：`feat/custom-field-export`，不用 `.` 或密码式长名
- `feat/` `fix/` `docs/` 前缀必须与提交 type 一致
- 一个分支只做一件事（单一职责），避免大杂烩 PR

## 4. 合并纪律

- 所有进入 `dev` 的改动走 **Pull Request / Merge Request**，禁止直接 push 到 `dev`
- PR 通过前必须通过 **CI**（后端冒烟测试 `npm test` + 前端构建 `npm run build`）
- 合并前确认无未决评审意见、DoD 已满足（见 [代码评审与 DoD](/dev/code-review)）
- 冲突在当前分支解决，不要覆盖他人分支

## 5. 红线

- **绝不直接 push 到 main**：main 是受保护分支
- **绝不 `git push --force`** 到共享分支（dev/main）
- **绝不修改已合并 / 已发布的迁移文件**：迁移只追加，改历史迁移 = 生产灾难（见 [数据库迁移](/dev/migration)）
- **提交信息必须规范**：不可用 `update` `fix stuff` 这类无信息提交

## 6. 示例流程

```bash
# 从一个干净 dev 出发
git checkout dev && git pull

# 切功能分支
git checkout -b feat/po-export

# 开发 → 分步提交（符合 Conventional Commits）
git add . && git commit -m "feat(order): 新增PO导出字段"

# 推送到远端，发起 PR 到 dev
git push -u origin feat/po-export
```

## 下一步

[代码评审与 DoD](/dev/code-review) —— 定义「一个改动何时算完成」。