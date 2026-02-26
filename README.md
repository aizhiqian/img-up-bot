# tg-img-bridge

Telegram Channel 图片消息自动上传到 CloudFlare-ImgBed 的中转服务（Node.js + TypeScript）。

## 功能

- 接收 Telegram Webhook（`channel_post` / `edited_channel_post`）
- 仅处理白名单 Channel
- 自动下载 Telegram 原图并上传到 ImgBed
- 上传成功后可自动回写 URL 到同一 Channel
- `chat_id + message_id` 去重，避免 Telegram 重试导致重复上传
- `file_id -> uploaded_url` 映射复用，减少重复上传
- 结构化日志输出，敏感字段自动脱敏

## 1. 先决条件

- Node.js >= 20
- 一个 Telegram Bot（已加入目标 Channel 且具备管理员权限）
- 可公网访问的 Webhook 地址（HTTPS）
- CloudFlare-ImgBed upload token（建议仅 upload 权限）

## 2. 环境变量

复制示例配置并填写真实值：

```bash
cp .env.example .env
```

关键变量：

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_URL`
- `TELEGRAM_ALLOWED_CHAT_IDS`（逗号分隔）
- `IMGBED_BASE_URL`
- `IMGBED_UPLOAD_TOKEN`
- `IMGBED_UPLOAD_PATH`（默认 `/upload`）
- `REQUEST_TIMEOUT_MS`
- `RETRY_MAX_ATTEMPTS`
- `MAX_UPLOAD_BYTES`
- `LOG_LEVEL`
- `ENABLE_CHANNEL_REPLY`（默认 `true`）
- `CHANNEL_REPLY_TEMPLATE`（可选，支持 `{url}` 占位符）
- `DEDUP_STORE_TYPE`（当前建议 `memory`）

## 3. 安装与启动

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm start
```

健康检查：

```bash
curl http://127.0.0.1:3000/healthz
```

## 4. 注册 Webhook

设置 Webhook：

```bash
npm run webhook:set
```

查看 Webhook 状态：

```bash
npm run webhook:info
```

> 脚本使用环境变量中的 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_WEBHOOK_URL`。

## 5. Channel 配置说明

1. 将 Bot 添加到目标 Channel。
2. 授予 Bot 管理员权限（至少能读取 Channel 消息并发送消息）。
3. 将 Channel 的 `chat.id` 填入 `TELEGRAM_ALLOWED_CHAT_IDS`。

## 6. 测试

```bash
npm test
```

覆盖：

- `parseUpdate` 的消息过滤逻辑
- `uploadImage` 对 `data[0].src` 的解析与异常处理
- `dedupStore` 去重行为
- Webhook 端到端链路（mock 下载/上传/回写）
