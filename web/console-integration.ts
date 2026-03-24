import { consoleManagerService, ConsoleManagerType } from './console-manager/index.ts';

/**
 * CLI 控制台管理器集成
 * 
 * 将新的 Console Manager 服务集成到现有的微信命令处理中
 * 同时保持与原有 opencodeManager 的兼容性
 */

// 当前活动的 CLI 类型
let activeCLIType: ConsoleManagerType = 'opencode';

/**
 * 解析微信消息中的控制台命令
 * 支持自然语言命令
 */
export function parseConsoleCommand(message: string): {
  type: 'console' | 'switch' | 'unknown';
  command?: string;
  targetPath?: string;
} {
  const trimmed = message.trim();

  // 控制台控制命令
  const consolePatterns = [
    // 停止/关闭命令
    { pattern: /^(stop|关闭|停止|kill|结束)\s*(opencode|claude|codex|aider|copilot|codeium|tabby)?$/i, action: 'stop' },
    // 启动命令
    { pattern: /^(start|启动|开启|open)\s*(opencode|claude|codex|aider|copilot|codeium|tabby)?$/i, action: 'start' },
    // 重启命令
    { pattern: /^(restart|重启)\s*(opencode|claude|codex|aider|copilot|codeium|tabby)?$/i, action: 'restart' },
    // 状态命令
    { pattern: /^(status|状态|info|信息|st)$/i, action: 'status' },
    // 列表命令
    { pattern: /^(list|列表|ls|ps)$/i, action: 'list' },
    // 版本命令
    { pattern: /^(version|版本|-v)$/i, action: 'version' }
  ];

  for (const { pattern, action } of consolePatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      // 检测指定的 CLI 类型
      const cliType = match[2]?.toLowerCase();
      if (cliType) {
        const typeMap: Record<string, ConsoleManagerType> = {
          'opencode': 'opencode',
          'claude': 'claude-code',
          'codex': 'codex',
          'aider': 'aider',
          'copilot': 'copilot',
          'codeium': 'codeium',
          'tabby': 'tabby'
        };
        if (typeMap[cliType]) {
          activeCLIType = typeMap[cliType];
        }
      }

      return {
        type: 'console',
        command: action
      };
    }
  }

  // 目录切换命令
  const switchPatterns = [
    /^cd\s+(.+)$/i,
    /^切换到\s+(.+)$/i,
    /^switch\s+(.+)$/i,
    /^goto\s+(.+)$/i,
    /^跳转\s+(.+)$/i,
    /^打开\s+(.+)$/i
  ];

  for (const pattern of switchPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      let targetPath = match[1].trim();
      // 处理 ~
      if (targetPath.startsWith('~')) {
        targetPath = targetPath.replace('~', process.env.HOME || '');
      }
      return {
        type: 'switch',
        targetPath
      };
    }
  }

  return { type: 'unknown' };
}

/**
 * 执行控制台命令
 */
export async function executeConsoleCommand(
  commandType: string,
  targetPath?: string
): Promise<string> {
  // 设置当前 CLI 类型
  consoleManagerService.setCurrentManager(activeCLIType);

  switch (commandType) {
    case 'start':
      const startResult = await consoleManagerService.executeCommand(
        { type: 'start', targetPath },
        activeCLIType
      );
      return startResult.message;

    case 'stop':
      const stopResult = await consoleManagerService.executeCommand(
        { type: 'stop', force: false },
        activeCLIType
      );
      return stopResult.message;

    case 'restart':
      const restartResult = await consoleManagerService.executeCommand(
        { type: 'restart', targetPath },
        activeCLIType
      );
      return restartResult.message;

    case 'status':
      const statusResult = await consoleManagerService.executeCommand(
        { type: 'status' },
        activeCLIType
      );
      return statusResult.message;

    case 'list':
      const listResult = await consoleManagerService.executeCommand(
        { type: 'list' },
        activeCLIType
      );
      return listResult.message;

    case 'version':
      const versionResult = await consoleManagerService.executeCommand(
        { type: 'version' },
        activeCLIType
      );
      return versionResult.message;

    default:
      return '❓ 未知命令\n可用命令: start, stop, restart, status, list, version, cd /path';
  }
}

/**
 * 切换工作目录
 */
export async function switchDirectory(targetPath: string): Promise<string> {
  consoleManagerService.setCurrentManager(activeCLIType);
  const result = await consoleManagerService.executeCommand(
    { type: 'switch', targetPath },
    activeCLIType
  );
  return result.message;
}

/**
 * 获取当前 CLI 类型
 */
export function getActiveCLIType(): ConsoleManagerType {
  return activeCLIType;
}

/**
 * 设置当前 CLI 类型
 */
export function setActiveCLIType(type: ConsoleManagerType): void {
  activeCLIType = type;
  consoleManagerService.setCurrentManager(type);
}

/**
 * 获取所有可用的 CLI 类型
 */
export function getAvailableCLITypes() {
  return consoleManagerService.getAvailableManagers();
}
