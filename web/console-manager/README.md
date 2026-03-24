# CLI Console Manager 模块

统一的 AI CLI 工具控制台管理模块，支持多种 AI 编程助手的进程管理、目录切换和状态监控。

## 特性

- 🔧 **统一接口** - 所有 AI CLI 工具使用相同的 API
- 🚀 **进程管理** - 启动、停止、重启 CLI 进程
- 📁 **目录切换** - 支持工作目录的动态切换
- 📊 **状态监控** - 实时监控进程状态和工作目录
- 🔌 **易于扩展** - 简单的接口，方便接入新的 CLI 工具

## 支持的 CLI 工具

| 工具 | 状态 | 目录切换 | 说明 |
|------|------|----------|------|
| OpenCode | ✅ | ✅ | 支持多 Agent 的智能编程助手 |
| Claude Code | ✅ | ✅ | Anthropic Claude 官方 CLI |
| OpenAI Codex | ✅ | ✅ | OpenAI 官方代码生成助手 |
| Aider | ✅ | ✅ | 支持多模型的 AI 编程助手 |
| GitHub Copilot | ✅ | ❌ | GitHub 官方 AI 助手（不支持目录切换） |
| Codeium | ✅ | ❌ | 免费的 AI 编程助手 |
| Tabby | ✅ | ❌ | 自托管的 AI 助手（Docker） |

## 快速开始

### 1. 使用管理器服务（推荐）

```typescript
import { consoleManagerService, ConsoleManagerType } from './console-manager/index.ts';

// 设置当前活动的 CLI 类型
consoleManagerService.setCurrentManager('opencode');

// 解析并执行命令
const command = consoleManagerService.parseCommand('cd /path/to/project');
const result = await consoleManagerService.executeCommand(command);
console.log(result.message);
```

### 2. 直接使用具体管理器

```typescript
import { OpenCodeConsoleManager } from './console-manager/index.ts';

const manager = new OpenCodeConsoleManager();

// 启动 CLI
await manager.start({ directory: '/path/to/project' });

// 获取状态
const status = await manager.getStatus();
console.log(`PID: ${status.pid}, 目录: ${status.cwd}`);

// 切换目录
await manager.switchDirectory('/another/project');

// 停止 CLI
await manager.stop();
```

### 3. 使用工厂创建管理器

```typescript
import { ConsoleManagerFactory, ConsoleManagerType } from './console-manager/index.ts';

const manager = ConsoleManagerFactory.createManager('claude-code');
await manager.start({ directory: '/path/to/project' });
```

## API 参考

### CLIConsoleManager（基类）

所有 CLI 管理器都继承自此基类。

#### 方法

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `start(options?)` | 启动 CLI 进程 | `{ success, pid?, message }` |
| `stop(options?)` | 停止 CLI 进程 | `{ success, message, stoppedCount }` |
| `switchDirectory(path)` | 切换到新目录（重启进程） | `{ success, pid?, message }` |
| `getStatus()` | 获取当前状态 | `CLIProcessStatus` |
| `scanProcesses()` | 扫描所有相关进程 | `Array<{ pid, cwd }>` |
| `getVersion()` | 获取版本信息 | `string \| null` |
| `isInstalled()` | 检查是否已安装 | `boolean` |

#### 配置选项

```typescript
interface CLIConsoleConfig {
  command: string;           // CLI 命令名
  installCommand: string;    // 安装命令
  processPattern: string;    // 进程匹配模式
  supportsDirectory: boolean; // 是否支持目录切换
  defaultTimeout: number;    // 默认超时（毫秒）
}
```

### ConsoleManagerService（服务层）

提供统一的命令解析和执行接口。

#### 命令格式

| 命令 | 说明 | 示例 |
|------|------|------|
| `start [path]` | 启动 CLI | `start`, `启动 /path` |
| `stop` | 停止 CLI | `stop`, `停止`, `kill` |
| `restart [path]` | 重启 CLI | `restart`, `重启 /path` |
| `cd /path` | 切换目录 | `cd /path`, `切换到 /path` |
| `status` | 查看状态 | `status`, `状态` |
| `list` | 列出进程 | `list`, `列表`, `ls` |
| `version` | 查看版本 | `version`, `版本` |

### ConsoleManagerFactory（工厂）

```typescript
// 创建管理器
const manager = ConsoleManagerFactory.createManager('opencode');

// 获取所有可用管理器
const managers = ConsoleManagerFactory.getAvailableManagers();
```

## 扩展：添加新的 CLI 工具

要添加新的 CLI 工具支持，只需继承 `CLIConsoleManager`：

```typescript
import { CLIConsoleManager, CLIConsoleConfig } from './base.ts';

const MY_CLI_CONFIG: CLIConsoleConfig = {
  command: 'my-cli',
  installCommand: 'npm install -g my-cli',
  processPattern: 'bin/my-cli$',
  supportsDirectory: true,
  defaultTimeout: 120000
};

export class MyCLIConsoleManager extends CLIConsoleManager {
  constructor() {
    super(MY_CLI_CONFIG);
  }

  getName(): string {
    return 'My CLI';
  }

  getDescription(): string {
    return 'My CLI 描述';
  }
}

// 在 factory.ts 中注册
export type ConsoleManagerType = 
  | 'opencode' 
  | 'my-cli';  // 添加新类型

// 在 createManager 中添加 case
switch (type) {
  case 'my-cli':
    return new MyCLIConsoleManager();
}
```

## 文件结构

```
console-manager/
├── index.ts           # 模块入口
├── base.ts            # 基类定义
├── factory.ts         # 工厂类
├── service.ts         # 统一服务
└── providers/
    ├── opencode.ts    # OpenCode 管理器
    ├── claude-code.ts # Claude Code 管理器
    ├── codex.ts       # Codex 管理器
    ├── aider.ts       # Aider 管理器
    ├── copilot.ts     # Copilot 管理器
    ├── codeium.ts     # Codeium 管理器
    └── tabby.ts       # Tabby 管理器
```

## 与旧代码的兼容性

新的 Console Manager 模块设计为与现有的 `CLIProvider` 体系并存：

- `CLIProvider` - 用于消息处理和 AI 交互
- `CLIConsoleManager` - 用于进程管理和目录控制

两者可以独立使用，也可以组合使用：

```typescript
import { OpenCodeProvider } from './cli-providers/opencode.ts';
import { OpenCodeConsoleManager } from './console-manager/index.ts';

// 处理消息
const provider = new OpenCodeProvider(config);
const response = await provider.processMessage('Hello');

// 管理进程
const manager = new OpenCodeConsoleManager();
await manager.switchDirectory('/new/project');
```
