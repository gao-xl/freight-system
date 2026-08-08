# ADR-002: Monorepo 物理拆分方案（Phase 3.4 评估结论）

## Status: Accepted (2026-08-08) — 方案就绪，执行延后

## Background

执行总纲 Phase 3.4 规划"packages 物理拆分（Monorepo 正式化）"。前提是"模块边界已被验证，拆分风险低"。

现状核查（2026-08-08）：
- ✅ Phase 1 已完成**逻辑模块化**：`ModuleRegistry` 协议 + `src/modules/*` 目录即模块，customer 为样板
- ✅ Phase 3.5 已完成**插件协议验证**：notification（新插件标准写法）与 qingdao-port（存量模块收拢）两个官方示例可运行
- ✅ 模块边界已被真实代码验证：新增插件不动核心、`autoMount` 控制挂载、拓扑排序处理依赖
- ✅ 构建链路：backend（Node/Express）+ frontend（Vite）+ docs-site（VitePress）三个独立 package.json

## Decision

**物理拆分方案定稿，但执行延后**——符合执行总纲决策 2「逻辑模块化先行，物理拆分延后」。

拆分目标结构：

```
freight-system/
├── package.json              # workspace 根（npm workspaces 或 pnpm workspace）
├── packages/
│   ├── backend/              # src/ 整体迁移（backend 已是独立包）
│   ├── frontend/             # src/ 整体迁移
│   ├── docs-site/            # VitePress 文档站
│   └── plugin-*/             # 未来社区插件独立发布
```

拆分步骤（执行时按序）：
1. 根加 `package.json` 声明 `"workspaces": ["packages/*"]`（npm 原生支持，无需额外工具）
2. 迁移 backend/ → packages/backend/，frontend/ → packages/frontend/，docs-site/ → packages/docs-site/
3. 修引用：CI workflow 路径、docker-compose build context、README/文档链接
4. CI 回归验证：backend test + frontend build + docs build 全绿
5. 插件目录 `backend/src/modules/*` 保持现状（社区插件经 `ModuleRegistry.load(dir)` 动态加载，不要求物理拆包）

## Consequences

正面：
- 插件可独立发布、独立版本（未来社区生态基础）
- 目录边界物理强制（与逻辑协议双保险）

负面：
- 一次性大迁移：CI/compose/文档引用全要同步改，回归面大
- 当前收益后置：小团队二开者主要受益于"协议统一 + 目录清晰"，物理拆分对其无感
- 与 docs-site（刚建）和插件目录（刚验证）的引用耦合需要同时处理

## 执行触发条件

- 社区出现第一个"想独立发布插件"的真实需求；或
- v2.0 发布后需要插件市场（separate npm 包）时

## Related ADRs

- ADR-001（若有）：模块注册协议相关决策
- 执行总纲《开源升级方案-OPC小团队二开版》决策 2
