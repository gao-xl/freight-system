# 贡献指南 (Contributing)

感谢你参与本项目！这是一个面向 **OPC（一人公司）与 3-4 人小团队** 的开源货代系统，核心竞争力是**充分的二次开发能力**。无论你是修 Bug、加功能、补文档还是写插件，都欢迎提交。

---

## 1. 开发环境搭建

```bash
# 1. 克隆仓库
git clone <repo-url> freight-system
cd freight-system

# 2. 后端
cd backend
cp ../.env.example ../.env   # 生成配置（开发环境可不动）
npm install
npm run seed                 # 初始化演示数据（首次或重置时执行）
npm run dev                  # 启动后端，监听 http://localhost:3000

# 3. 前端（另开终端）
cd frontend
npm install
npm run dev                  # 启动前端，访问 http://localhost:5173
```

默认账号：`admin / 123456`（另有 manager / operator / finance，密码同为 123456）。

> **数据库初始化两条路径**：
> - **全新部署**：`npm run seed`（force sync 建表 + 演示数据，会清库，仅首次用）
> - **版本升级**：`npm run db:migrate`（增量迁移，保留数据）
> 开发环境重置可直接 `npm run seed`；生产/有真实数据时**只能用 migrate**。

---

## 2. 分支策略

- `main`：稳定发布分支，始终可运行
- `dev`：日常集成分支
- 功能分支：`feat/<scope>-<简述>`，如 `feat/order-export`
- 修复分支：`fix/<scope>-<简述>`，如 `fix/doc-path-traversal`

PR 一律合并到 `dev`；定期将 `dev` 合并到 `main` 并打版本标签。

---

## 3. 提交规范（Conventional Commits）

所有提交信息必须遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

[可选 body]

[可选 footer]
```

### type 取值

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `style` | 代码格式（不影响逻辑） |
| `refactor` | 重构（既不是 feat 也不是 fix） |
| `perf` | 性能优化 |
| `test` | 新增/修改测试 |
| `chore` | 构建/工具/依赖等杂项 |
| `build` | 构建系统或外部依赖变更 |
| `ci` | CI 配置变更 |

### scope 建议

按模块划分：`auth` `order` `booking` `customs` `document` `finance` `tracking` `integration` `automation` `security` `db` `ui` 等。

### 示例

```
feat(finance): 订单确认自动生成应收记录

fix(security): 修复文件下载路径穿越漏洞
docs(readme): 更新模块地图与二开入口
test(automation): 补充自动化幂等用例
```

---

## 4. 代码质量要求

提交前请确保：

- [ ] 后端 `node src/server.js` 能正常启动，无报错
- [ ] 改动涉及接口时，用默认账号跑通登录与对应接口
- [ ] 不引入硬编码密钥/口令（一律走环境变量或 `IntegrationConfig` 表）
- [ ] 金额字段使用 `DECIMAL`，不使用浮点
- [ ] 新增模型如有归属需求，补 `groupId/ownerId` 并在 `crudController` 启用 `scoped`
- [ ] 新增对接走适配器协议（`{code,name,send,query}`），放 `integrations/adapters/` 自动注册
- [ ] 文件上传相关改动须通过扩展名白名单与路径越界校验

---

## 5. 二次开发贡献

本项目的扩展点分三级，详见 [`docs/二开指南.md`](docs/二开指南.md)：

1. **配置级**：自定义字段 / 业务规则 / 流程配置 / 打印模板（零代码，Web 配置）
2. **文件级**：CRUD 模块 / 对接适配器 / 预警规则函数 / 自动化动作函数 / 事件监听
3. **插件级**：独立模块包，按 `ModuleRegistry` 协议导出 `{models, routes, services, seed, menu, events}`

贡献插件时，请在 `plugins/<你的插件>/` 下提供 `README` 与最小示例，最好附带一个可运行的演示场景。

---

## 6. 提交 PR

1. 在 `dev` 上拉新分支开发
2. 提交信息遵循 Conventional Commits
3. PR 标题即首条提交信息格式
4. PR 描述写清：动机、改动点、验证方式、是否影响数据兼容（如需迁移）
5. 涉及数据结构变更须提供 `backend/migrations/` 迁移脚本，**不要依赖 seed**

---

## 7. 行为准则

保持专业、友善、就事论事。技术分歧以《项目设计方案》《二次开发扩展空间设计》等文档为准绳；文档未覆盖的，以"零运维优先 / 二开优先 / 安全先行"三条铁律裁决。

感谢你的贡献！
