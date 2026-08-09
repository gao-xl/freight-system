# 快速开始

面向 **OPC（一人公司）与 3-4 人小团队** 的开源货代系统。3 分钟跑起来，10 分钟开始录业务。

## 方式一：Docker 一键部署（推荐）

```bash
git clone https://github.com/your-org/freight-system.git
cd freight-system
docker compose up -d --build
```

启动后访问 `http://localhost:8080`，默认账号 `admin / 123456`（**上线前必须改密**）。

包含：前端（Nginx）+ 后端（Node）+ PostgreSQL，数据持久化在 `pg-data` 命名卷。

## 方式二：源码运行（开发）

```bash
# 后端（:3000）
cd backend
cp .env.example .env
npm install
npm run seed        # 初始化演示数据（会清库重建，仅首次/重置用）
npm run dev

# 前端（:5173）
cd ../frontend
npm install
npm run dev
```

## 验收：跑通一个最小业务闭环

1. 登录（admin/123456）
2. 客户管理 → 新增客户
3. 订单管理 → 新建订单（选客户、航线、货量）
4. 订舱管理 → 为该订单订舱
5. 财务 → 新增应收费用 → 收款核销
6. 预警中心 → 看到系统自动产出的规则预警

## 下一步

- 读完《[核心概念](./concepts)》理解系统骨架
- 想定制功能 → 看《[二次开发指引](../dev/index)》与《[二开哲学](../dev/philosophy)》
- 要上生产 → 看《[Docker 部署](../deploy/docker)》与《[备份恢复](../deploy/backup)》
