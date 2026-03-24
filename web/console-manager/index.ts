/**
 * CLI Console Manager 模块
 * 
 * 提供统一的 AI CLI 工具控制台管理功能：
 * - 启动/停止 CLI 进程
 * - 切换工作目录
 * - 监控进程状态
 * - 多工具统一管理
 */

export { CLIConsoleManager, CLIConsoleConfig, CLIProcessStatus, StartOptions, StopOptions } from './base.ts';
export { ConsoleManagerFactory, ConsoleManagerType } from './factory.ts';
export { ConsoleManagerService, ConsoleCommand, CommandResult, consoleManagerService } from './service.ts';

// Provider 管理器
export { OpenCodeConsoleManager } from './providers/opencode.ts';
export { ClaudeCodeConsoleManager } from './providers/claude-code.ts';
export { CodexConsoleManager } from './providers/codex.ts';
export { AiderConsoleManager } from './providers/aider.ts';
export { CopilotConsoleManager } from './providers/copilot.ts';
export { CodeiumConsoleManager } from './providers/codeium.ts';
export { TabbyConsoleManager } from './providers/tabby.ts';
