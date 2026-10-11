# bullmq-mail

Bun + BullMQ 生产级邮件队列示例：API 入队、独立 Worker 消费、SMTP 账号池故障转移、Redis 持久化、优雅停机。

## 架构

```text
Client ──POST /api/mail──▶ API (Bun.serve + Queue)
                              │
                              ▼
                           Redis 7 (AOF)
                              ▲
                              │
                         Worker × N
                              │
                              ▼
                     SMTP account pool
                  (weight + cooldown failover)
```

生产要点：

| 点 | 做法 |
|---|---|
| 进程分离 | `src/main.ts`（API）与 `src/worker.ts`（Worker）独立进程，可水平扩 Worker |
| 重试 | 默认 5 次，指数退避（3s 起） |
| 限流 | Worker `limiter` 全局限制发送速率，保护 SMTP |
| 幂等 | `idempotencyKey` → BullMQ `jobId` |
| 账号池 | YAML 配置多 SMTP；失败后按 `cooldown` 冷却并故障转移 |
| 观测 | `/health` 队列计数；结构化 JSON 日志 |
| 停机 | SIGINT/SIGTERM → `worker.close()` 排空当前任务；compose `stop_grace_period` 大于进程优雅期 |

## 快速开始

```bash
bun install
make deps          # Redis + Mailpit，随机端口写入 .env

# 终端 1
make api

# 终端 2
make worker
```

入队一封邮件：

```bash
bun run scripts/enqueue-sample.ts --to you@example.com
```

或：

```bash
curl -s http://127.0.0.1:3000/api/mail \
  -H 'content-type: application/json' \
  -d '{
    "to": "you@example.com",
    "subject": "hello from bullmq-mail",
    "text": "queue works",
    "idempotencyKey": "demo-001"
  }'
```

- Health: http://127.0.0.1:3000/health

## 全量 compose（API + Worker + Redis）

开发态 `compose.yml` 仍挂载源码，直接用 `oven/bun` 跑。生产态用 `compose-prod.yml`：`Dockerfile` 内 `bun build --target=bun --outdir dist` 打进依赖，运行时只带 `dist/`（API / Worker 共用同一镜像）。

```bash
cp .env.example .env
docker compose -f compose-prod.yml up -d --build
docker compose -f compose-prod.yml up -d --scale worker=2
```

宿主机端口使用随机映射，避免和本机已有 Redis / HTTP 服务冲突：

```bash
docker compose -f compose-prod.yml port redis 6379
docker compose -f compose-prod.yml port api 3000
```

compose 内 `REDIS_HOST=redis` 会覆盖 `.env` 里的本机地址。本机只起 Redis、进程跑在宿主机时：

```bash
docker compose up -d redis
export REDIS_PORT=$(docker compose port redis 6379 | cut -d: -f2)
bun run api
bun run worker
```

## API

### `POST /api/mail`

```json
{
  "to": "a@example.com",
  "subject": "hi",
  "text": "plain",
  "html": "<p>html</p>",
  "replyTo": "support@example.com",
  "idempotencyKey": "order-42-receipt",
  "priority": 1,
  "delayMs": 5000
}
```

成功返回 `202` + `{ id, name, queue }`。相同 `idempotencyKey` 再次提交返回 `409`。

### `GET /api/mail/:id`

返回任务状态、进度、失败原因与发送结果（`providerId` / `messageId`）。

## SMTP 账号池

默认读取 `config/mail-providers.yml`（来自笔记库 SMTP 账号池快照）。字段说明见 `config/mail-providers.example.yml`。

关键字段：

- `weight`：被选中的相对权重
- `cooldown`：单账号失败后冷却（如 `2m`）
- `security`：`implicit`（465 SMTPS）/ `starttls` / `plain`

### 本地 Mailpit

compose 已包含 [Mailpit](https://github.com/axllent/mailpit)（捕获邮件、不外发）：

```bash
docker compose up -d mailpit
docker compose port mailpit 8025   # Web UI
docker compose port mailpit 1025   # SMTP
```

Worker 走 Mailpit（compose 网络内）：

```bash
MAIL_PROVIDERS_FILE=./config/mail-providers.mailpit.yml bun run worker
# 或在 compose worker.environment 里改同一变量
```

宿主机进程连 Mailpit 时，把 `mail-providers.mailpit.yml` 里的 `host` 改成 `127.0.0.1`，`port` 改成 `docker compose port mailpit 1025` 给出的宿主机端口。

## 环境变量

见 `.env.example`。常用项：

| 变量 | 含义 | 默认 |
|---|---|---|
| `REDIS_HOST` / `REDIS_PORT` | Redis | `127.0.0.1` / `6379` |
| `MAIL_PROVIDERS_FILE` | 账号池 YAML | `./config/mail-providers.yml` |
| `WORKER_CONCURRENCY` | 单进程并发 | `3` |
| `WORKER_RATE_MAX` | 全局限流：时间窗内最大任务数 | `5` |
| `WORKER_RATE_DURATION_MS` | 限流时间窗 | `1000` |
| `SHUTDOWN_GRACE_MS` | Worker 优雅停机等待 | `20000` |

## 脚本

| 命令 | 作用 |
|---|---|
| `bun run api` | 启动 API |
| `bun run worker` | 启动 Worker |
| `bun run build` | `bun build --target=bun --outdir dist` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run scripts/enqueue-sample.ts --to ...` | 入队示例邮件 |
