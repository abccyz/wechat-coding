import { CLIConsoleManager, CLIProcessStatus } from './base.ts';
import { ConsoleManagerFactory, ConsoleManagerType } from './factory.ts';

/**
 * 控制台命令类型
 */
export type ConsoleCommand =
  | { type: 'start'; targetPath?: string; args?: string[] }
  | { type: 'stop'; force?: boolean }
  | { type: 'restart'; targetPath?: string }
  | { type: 'switch'; targetPath: string }
  | { type: 'status' }
  | { type: 'list' }
  | { type: 'version' }
  | { type: 'unknown'; raw: string };

/**
 * 命令执行结果
 */
export interface CommandResult {
  success: boolean;
  message: string;
  data?: {
    pid?: number;
    directory?: string | null;
    uptime?: number;
    version?: string | null;
    processes?: Array<{ pid: number; cwd: string | null; isManaged: boolean }>;
  };
}

/**
 * 统一控制台管理服务
 * 
 * 管理多个 AI CLI 控制台实例，提供统一的命令接口
 */
export class ConsoleManagerService {
  private managers: Map<ConsoleManagerType, CLIConsoleManager> = new Map();
  private currentManager: ConsoleManagerType | null = null;

  /**
   * 获取或创建管理器实例
   */
  getManager(type: ConsoleManagerType): CLIConsoleManager {
    if (!this.managers.has(type)) {
      const manager = ConsoleManagerFactory.createManager(type);
      this.managers.set(type, manager);
    }
    return this.managers.get(type)!;
  }

  /**
   * 设置当前活动的管理器
   */
  setCurrentManager(type: ConsoleManagerType): void {
    this.currentManager = type;
  }

  /**
   * 获取当前活动的管理器
   */
  getCurrentManager(): CLIConsoleManager | null {
    if (!this.currentManager) {
      return null;
    }
    return this.getManager(this.currentManager);
  }

  /**
   * 获取当前管理器类型
   */
  getCurrentManagerType(): ConsoleManagerType | null {
    return this.currentManager;
  }

  /**
   * 解析命令
   */
  parseCommand(message: string): ConsoleCommand {
    const trimmed = message.trim().toLowerCase();

    // 启动命令
    const startPatterns = [
      /^start(?:\s+(.+))?$/i,
      /^启动(?:\s+(.+))?$/i,
      /^open(?:\s+(.+))?$/i,
      /^开启(?:\s+(.+))?$/i
    ];
    for (const pattern of startPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return { type: 'start', targetPath: match[1]?.trim() };
      }
    }

    // 停止命令
    const stopPatterns = [
      /^stop$/i,
      /^停止$/i,
      /^close$/i,
      /^关闭$/i,
      /^kill$/i,
      /^结束$/i
    ];
    for (const pattern of stopPatterns) {
      if (pattern.test(trimmed)) {
        return { type: 'stop', force: trimmed.includes('force') || trimmed.includes('强制') };
      }
    }

    // 重启命令
    const restartPatterns = [
      /^restart(?:\s+(.+))?$/i,
      /^重启(?:\s+(.+))?$/i
    ];
    for (const pattern of restartPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return { type: 'restart', targetPath: match[1]?.trim() };
      }
    }

    // 切换目录命令
    const switchPatterns = [
      /^cd\s+(.+)$/i,
      /^切换到\s+(.+)$/i,
      /^switch\s+(.+)$/i,
      /^goto\s+(.+)$/i,
      /^跳转\s+(.+)$/i
    ];
    for (const pattern of switchPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        let targetPath = match[1].trim();
        // 处理 ~
        if (targetPath.startsWith('~')) {
          targetPath = targetPath.replace('~', process.env.HOME || '');
        }
        return { type: 'switch', targetPath };
      }
    }

    // 状态命令
    const statusPatterns = [
      /^status$/i,
      /^状态$/i,
      /^st$/i,
      /^info$/i,
      /^信息$/i,
      /^当前.*工作.*路径|当前.*目录|pwd/i
    ];
    for (const pattern of statusPatterns) {
      if (pattern.test(trimmed)) {
        return { type: 'status' };
      }
    }

    // 列表命令
    const listPatterns = [
      /^list$/i,
      /^列表$/i,
      /^ls$/i,
      /^ps$/i
    ];
    for (const pattern of listPatterns) {
      if (pattern.test(trimmed)) {
        return { type: 'list' };
      }
    }

    // 版本命令
    const versionPatterns = [
      /^version$/i,
      /^版本$/i,
      /^--version$/i,
      /^-v$/i
    ];
    for (const pattern of versionPatterns) {
      if (pattern.test(trimmed)) {
        return { type: 'version' };
      }
    }

    return { type: 'unknown', raw: message };
  }

  /**
   * 执行命令
   */
  async executeCommand(
    command: ConsoleCommand,
    type?: ConsoleManagerType
  ): Promise<CommandResult> {
    const managerType = type || this.currentManager;
    if (!managerType && command.type !== 'unknown') {
      return {
        success: false,
        message: '未指定 CLI 类型，请先设置当前管理器'
      };
    }

    const manager = managerType ? this.getManager(managerType) : null;

    switch (command.type) {
      case 'start':
        if (!manager) {
          return { success: false, message: '未指定 CLI 类型' };
        }
        const startResult = await manager.start({
          directory: command.targetPath
        });
        return {
          success: startResult.success,
          message: startResult.message,
          data: startResult.pid ? { pid: startResult.pid } : undefined
        };

      case 'stop':
        if (!manager) {
          return { success: false, message: '未指定 CLI 类型' };
        }
        const stopResult = await manager.stop({ force: command.force });
        return {
          success: stopResult.success,
          message: stopResult.message,
          data: { processes: [] } // 简化输出
        };

      case 'restart':
        if (!manager) {
          return { success: false, message: '未指定 CLI 类型' };
        }
        await manager.stop({ force: false });
        await new Promise(r => setTimeout(r, 500));
        const restartResult = await manager.start({
          directory: command.targetPath
        });
        return {
          success: restartResult.success,
          message: `🔄 重启完成\n${restartResult.message}`,
          data: restartResult.pid ? { pid: restartResult.pid } : undefined
        };

      case 'switch':
        if (!manager) {
          return { success: false, message: '未指定 CLI 类型' };
        }
        const switchResult = await manager.switchDirectory(command.targetPath);
        return {
          success: switchResult.success,
          message: switchResult.message,
          data: switchResult.pid ? { pid: switchResult.pid, directory: command.targetPath } : undefined
        };

      case 'status':
        if (!manager) {
          return {
            success: true,
            message: this.getHelpMessage()
          };
        }
        const status = await manager.getStatus();
        const statusMsg = this.formatStatus(manager.getName(), status);
        return {
          success: true,
          message: statusMsg,
          data: {
            pid: status.pid || undefined,
            directory: status.cwd,
            uptime: status.uptime,
            processes: status.allProcesses
          }
        };

      case 'list':
        if (!manager) {
          return { success: false, message: '未指定 CLI 类型' };
        }
        const listStatus = await manager.getStatus();
        if (listStatus.allProcesses.length === 0) {
          return {
            success: true,
            message: `📂 没有运行的 ${manager.getName()} 进程`
          };
        }
        let msg = `📁 ${manager.getName()} 进程列表:\n`;
        listStatus.allProcesses.forEach((p, i) => {
          const managed = p.isManaged ? '✅' : '⚪';
          const cwdShort = p.cwd ? (p.cwd.length > 50 ? p.cwd.substring(0, 50) + '...' : p.cwd) : '未知';
          msg += `${managed} ${i + 1}. PID:${p.pid} - ${cwdShort}\n`;
        });
        return {
          success: true,
          message: msg,
          data: { processes: listStatus.allProcesses }
        };

      case 'version':
        if (!manager) {
          return { success: false, message: '未指定 CLI 类型' };
        }
        const version = await manager.getVersion();
        return {
          success: !!version,
          message: version ? `${manager.getName()} 版本: ${version}` : '无法获取版本信息',
          data: { version }
        };

      case 'unknown':
      default:
        return {
          success: false,
          message: this.getHelpMessage()
        };
    }
  }

  /**
   * 获取所有可用管理器的信息
   */
  getAvailableManagers() {
    return ConsoleManagerFactory.getAvailableManagers();
  }

  /**
   * 格式化状态信息
   */
  private formatStatus(name: string, status: CLIProcessStatus & { allProcesses: any[] }): string {
    let msg = `🔍 ${name} 状态:\n`;
    msg += `运行状态: ${status.isRunning ? '🟢 运行中' : '🔴 未运行'}\n`;

    if (status.pid) {
      msg += `PID: ${status.pid}\n`;
    }

    if (status.cwd) {
      msg += `📁 工作目录:\n${status.cwd}\n`;
    }

    if (status.uptime > 0) {
      const mins = Math.floor(status.uptime / 60);
      const secs = status.uptime % 60;
      msg += `⏱️ 运行时间: ${mins}分${secs}秒\n`;
    }

    msg += `\n进程总数: ${status.allProcesses.length} 个`;

    return msg;
  }

  /**
   * 获取帮助信息
   */
  private getHelpMessage(): string {
    return `❓ 未知命令

可用命令:
• start [path] - 启动 CLI
• stop - 停止 CLI
• restart [path] - 重启 CLI
• cd /path/to/dir - 切换到指定目录
• status - 查看状态
• list - 列出所有进程
• version - 查看版本

支持的 CLI 工具:
${ConsoleManagerFactory.getAvailableManagers().map(m => `• ${m.name}`).join('\n')}`;
  }
}

// 导出单例实例
export const consoleManagerService = new ConsoleManagerService();
