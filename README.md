# tg-img-bridge

Telegram Channel 图片中转服务（Express + TypeScript）：接收 Telegram webhook，下载图片，上传到 CloudFlare-ImgBed，并可选回写上传 URL 到频道。

## 功能特性

- 支持 Telegram `channel_post` / `edited_channel_post`
- 支持两类图片消息：
  - `photo`（自动选最大尺寸）
  - `document` 且 `mime_type` 为 `image/*`
- 仅处理白名单频道（`TELEGRAM_ALLOWED_CHAT_IDS`）
- 下载 Telegram 图片并上传到 ImgBed
- 可选自动回写 URL 到同一频道（`ENABLE_CHANNEL_REPLY=true`）
- 两级去重：
  - `chat_id:message_id -> uploaded_url`
  - `file_id -> uploaded_url`
- 结构化日志输出，敏感字段自动脱敏

## 处理流程

1. 接收 `POST /telegram/webhook`
2. 解析并过滤 update（只保留白名单频道的图片消息）
3. 去重命中则直接返回
4. 未命中则下载 Telegram 文件并上传 ImgBed
5. 记录去重映射，必要时回写 URL 到频道

## 先决条件

- Node.js >= 20
- 一个 Telegram Bot（已加入目标 Channel 且具备管理员权限）
- 可公网访问的 HTTPS Webhook 地址
- CloudFlare-ImgBed upload token（建议最小权限）

## 快速开始

```bash
npm install
cp .env.example .env
npm run dev
```

健康检查：

```bash
curl http://127.0.0.1:3000/healthz
```

生产构建：

```bash
npm run build
npm start
```

## 环境变量

从 `.env.example` 复制后按需填写。

### 必填

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_URL`
- `TELEGRAM_ALLOWED_CHAT_IDS`（逗号分隔）
- `IMGBED_BASE_URL`
- `IMGBED_UPLOAD_TOKEN`

### 可选（含默认值）

- `PORT`（默认 `3000`）
- `IMGBED_UPLOAD_PATH`（默认 `/upload`）
- `REQUEST_TIMEOUT_MS`（默认 `10000`）
- `RETRY_MAX_ATTEMPTS`（默认 `3`）
- `MAX_UPLOAD_BYTES`（默认 `20971520`，20 MiB）
- `LOG_LEVEL`（默认 `info`，可选 `debug|info|warn|error`）
- `ENABLE_CHANNEL_REPLY`（默认 `true`）
- `CHANNEL_REPLY_TEMPLATE`（可选，支持 `{url}` 占位符）
- `DEDUP_STORE_TYPE`（默认 `memory`）

> 注意：`DEDUP_STORE_TYPE=redis` 当前尚未实现。

## Webhook 管理

设置 webhook：

```bash
npm run webhook:set
```

查询 webhook 状态：

```bash
npm run webhook:info
```

### 代理环境常见问题（`fetch failed`）

在部分网络环境下，Node.js `fetch` 不会自动使用 `HTTP_PROXY/HTTPS_PROXY`，可能导致 `webhook:set` / `webhook:info` 报 `fetch failed`。

可这样执行：

```bash
NODE_USE_ENV_PROXY=1 npm run webhook:set
NODE_USE_ENV_PROXY=1 npm run webhook:info
```

## 图片类型与文件名策略

上传时会尽量保证图片 MIME 正确，以便浏览器直接预览：

- 若 Telegram 下载响应是 `image/*`，直接沿用。
- 若不是 `image/*`（如 `application/octet-stream`），根据 Telegram 原始 `file_path` 扩展名推断（如 `.png -> image/png`）。
- 若仍无法判断，回退为 `image/jpeg`。

上传文件名格式：

- `yyyyMMdd_HHmmss.<ext>`
- 例如：`20260205_020409.png`

## 支持/忽略的消息类型

会处理：

- `channel_post.photo`
- `edited_channel_post.photo`
- `channel_post.document`（且 `mime_type` 为 `image/*`）
- `edited_channel_post.document`（且 `mime_type` 为 `image/*`）

会忽略：

- 非白名单频道消息
- 非图片消息（文本、普通文件、`mime_type` 非 `image/*` 的 document）

## 测试

运行全部测试：

```bash
npm test
```

运行单测文件：

```bash
npm test -- tests/parseUpdate.test.ts
npm test -- tests/uploadImage.test.ts
npm test -- tests/webhook.integration.test.ts
```

## 常见排查

### 1) Webhook 已设置，但 Telegram `last_error_message` 提示 500

说明 Telegram 已打到你的 webhook 地址，但你的服务内部报错。请先查看服务日志中的：

- `telegram_update_failed`
- `request_failed`

### 2) 从其他频道转发能触发，本地直接发送不触发

通常是消息类型差异（`photo` vs `document`）。本项目现已支持 `document` 图片（`mime_type=image/*`）。

### 3) 图片 URL 打开时变成下载

先检查响应头：

```bash
curl -L -I <your_uploaded_image_url>
```

重点关注：

- `Content-Type` 是否为 `image/*`
- `Content-Disposition` 是否影响浏览器行为

## 项目命令

- 开发：`npm run dev`
- 构建：`npm run build`
- 启动：`npm start`
- 测试：`npm test`
- Webhook 设置：`npm run webhook:set`
- Webhook 查询：`npm run webhook:info`

## 参考

- CloudFlare-ImgBed: https://github.com/MarSeventh/CloudFlare-ImgBed
- API docs index: https://raw.githubusercontent.com/MarSeventh/CloudFlare-ImgBed-Docs/main/src/api/index.md
