# Weixin Bot SDK for Node.js

微信 iLink Bot SDK — 让任何 Agent 5 分钟接入微信消息。

> **参考项目**  
> 本项目基于 [epiral/weixin-bot](https://github.com/epiral/weixin-bot) 的实现思路进行开发，感谢原作者提供的微信 iLink Bot API 集成方案。

## 特性

- 扫码登录，凭证自动保存
- 长轮询收消息，HTTP 发消息
- context_token 自动管理，开发者无需关心
- Typing 状态（"对方正在输入中"）
- Session 过期自动重登录
- 零配置，零 Webhook，纯本地运行
- 零运行时依赖，使用 Node.js 内置 API
- **支持多 AI CLI 控制台工具**（见下方计划）

## AI CLI 控制台接入计划

本项目计划接入主流 AI CLI 控制台工具，实现微信与 AI 的无缝对话。

### 已接入 ✅

| CLI 工具 | 状态 | 说明 |
|---------|------|------|
| **OpenCode** | ✅ 已调试完成 | 支持多 Agent 的智能编程助手，支持 build、plan、explore 等 Agents |
| **OpenAI Codex** | ✅ 已接入 | OpenAI 官方代码生成助手，支持 GPT-4o、GPT-4-Turbo 等模型 |

### 开发中 🚧

| CLI 工具 | 状态 | 说明 |
|---------|------|------|
| **Claude Code** | 🚧 开发中 | Anthropic Claude 官方 CLI，支持 Claude 3 Opus/Sonnet/Haiku |
| **Aider** | 📋 计划中 | 支持多模型（GPT-4、Claude 等）的 AI 编程助手 |
| **GitHub Copilot CLI** | 📋 计划中 | GitHub Copilot 命令行工具 |
| **Codeium** | 📋 计划中 | 免费的 AI 编程助手 |
| **Tabby** | 📋 计划中 | 自托管的 AI 编程助手 |

### 接入架构

```
微信消息 → 微信机器人 SDK → CLI Provider 接口 → AI CLI 工具
                ↑                                    ↓
           接收回复 ← 发送消息 ← 执行 CLI 命令 ← 返回结果
```

所有 CLI 工具通过统一的 `CLIProvider` 接口接入：
- `processMessage()` - 处理消息并获取 AI 回复
- `listAgents()` - 列出可用的 Agents/模型
- `testConnection()` - 测试 CLI 连接状态

### 使用方式

1. 在 Web 界面选择 AI 工具（OpenCode、Codex 等）
2. 选择具体的 Agent 或模型
3. 启用 AI 回复
4. 在微信发送消息，自动转发给选中的 AI CLI 处理
5. AI 回复自动发送回微信

## 要求

- Node.js >= 18 (支持原生 fetch)
- TypeScript >= 5.0 (可选，用于开发)

## 安装

```bash
npm install
npm run build
```

## 快速开始

```typescript
import { WeixinBot } from './src/index.js'

const bot = new WeixinBot()
await bot.login()

bot.onMessage(async (msg) => {
  console.log(`[${msg.timestamp.toLocaleTimeString()}] ${msg.userId}: ${msg.text}`)
  await bot.reply(msg, `你说了: ${msg.text}`)
})

await bot.run()
```

## 运行示例

```bash
# 编译 TypeScript
npm run build

# 运行示例
npm run example

# 或强制重新登录
npx tsx examples/nodejs/echo-bot.ts --force-login
```

## API 参考

### `new WeixinBot(options?)`

创建机器人实例。

- `baseUrl?: string` - 覆盖 iLink API 基础 URL
- `tokenPath?: string` - 覆盖凭证文件路径，默认: `~/.weixin-bot/credentials.json`
- `onError?: (error: unknown) => void` - 接收轮询或处理错误的回调

### `await bot.login(options?)`

启动扫码登录，本地存储凭证，返回活跃会话。

- `force?: boolean` - 忽略缓存凭证，要求重新扫码登录

### `bot.onMessage(handler)`

注册异步或同步消息处理回调。每个入站用户消息会转换为：

```typescript
interface IncomingMessage {
  userId: string
  text: string
  type: 'text' | 'image' | 'voice' | 'file' | 'video'
  raw: WeixinMessage
  _contextToken: string
  timestamp: Date
}
```

### `await bot.reply(msg, text)`

使用消息的 `context_token` 回复入站消息。

### `await bot.sendTyping(userId)`

在微信聊天中显示"对方正在输入中"。需要在 SDK 收到至少一条来自该用户的消息后才能使用。

### `await bot.stopTyping(userId)`

取消输入状态。

### `await bot.send(userId, text)`

使用最新缓存的 `context_token` 发送主动消息。需要在 SDK 收到至少一条来自该用户的消息后才能使用。

### `await bot.run()`

启动长轮询循环，派发入站消息到注册的处理器，在瞬时失败时重新连接，在会话过期时触发重新登录。

### `bot.stop()`

优雅停止长轮询循环。

## 工作原理

1. `login()` 获取二维码登录 URL，等待微信确认，保存返回的 bot token
2. `run()` 对 `getupdates` 执行长轮询
3. 每个入站消息规范化为 `IncomingMessage` 并发送到你的回调
4. `reply()` 和 `send()` 重用内部管理的 `context_token`

## 项目结构

```
.
├── src/
│   ├── index.ts      # 模块导出
│   ├── client.ts     # WeixinBot 主类
│   ├── auth.ts       # 登录和认证
│   ├── api.ts        # API 请求层
│   └── types.ts      # TypeScript 类型定义
├── examples/
│   └── nodejs/
│       └── echo-bot.ts   # 完整示例
├── package.json
├── tsconfig.json
└── README.md
```

## 协议

基于微信 iLink Bot API (`https://ilinkai.weixin.qq.com`)。

关键端点：
- `/ilink/bot/get_bot_qrcode` - 获取登录二维码
- `/ilink/bot/get_qrcode_status` - 轮询扫码状态
- `/ilink/bot/getupdates` - 长轮询获取消息
- `/ilink/bot/sendmessage` - 发送消息
- `/ilink/bot/getconfig` - 获取配置（含 typing_ticket）
- `/ilink/bot/sendtyping` - 发送输入状态

## 许可证

MIT
