import { spawn, ChildProcess } from 'node:child_process';

/**
 * CLI 进程状态
 */
export interface CLIProcessStatus {
  pid: number | null;
  cwd: string | null;
  startTime: Date | null;
  isRunning: boolean;
  uptime: number; // 运行时间（秒）
}

/**
 * CLI 控制台配置
 */
export interface CLIConsoleConfig {
  command: string;          // CLI 命令名
  installCommand: string;   // 安装命令
  processPattern: string;   // 进程匹配模式（用于 pgrep）
  supportsDirectory: boolean; // 是否支持指定工作目录
  defaultTimeout: number;   // 默认超时时间（毫秒）
}

/**
 * 启动选项
 */
export interface StartOptions {
  directory?: string;       // 工作目录
  args?: string[];          // 额外参数
  detached?: boolean;       // 是否分离进程
  env?: Record<string, string>; // 额外环境变量
  timeout?: number;         // 超时时间
}

/**
 * 停止选项
 */
export interface StopOptions {
  force?: boolean;          // 是否强制终止（SIGKILL）
  gracefulTimeout?: number; // 优雅退出超时时间
}

/**
 * CLI 控制台管理器抽象基类
 * 所有 AI CLI 工具的管理器都应继承此类
 */
export abstract class CLIConsoleManager {
  protected config: CLIConsoleConfig;
  protected currentProcess: ChildProcess | null = null;
  protected currentDirectory: string | null = null;
  protected startTime: Date | null = null;
  protected monitoredPids: Set<number> = new Set();

  constructor(config: CLIConsoleConfig) {
    this.config = {
      ...config,
      defaultTimeout: config.defaultTimeout ?? 120000
    };
  }

  /**
   * 获取 CLI 命令名
   */
  getCommand(): string {
    return this.config.command;
  }

  /**
   * 获取安装命令
   */
  getInstallCommand(): string {
    return this.config.installCommand;
  }

  /**
   * 获取管理器名称
   */
  abstract getName(): string;

  /**
   * 获取管理器描述
   */
  abstract getDescription(): string;

  /**
   * 检查 CLI 是否已安装
   */
  async isInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      const check = spawn('which', [this.config.command], {
        timeout: 5000,
        stdio: 'pipe'
      });

      check.on('close', (code) => {
        resolve(code === 0);
      });

      check.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * 启动 CLI 进程
   * @param options 启动选项
   * @returns 启动结果
   */
  async start(options: StartOptions = {}): Promise<{
    success: boolean;
    pid?: number;
    message: string;
    error?: Error;
  }> {
    const {
      directory,
      args = [],
      detached = true,
      env = {},
      timeout = this.config.defaultTimeout
    } = options;

    // 验证目录
    if (directory && this.config.supportsDirectory) {
      try {
        const fs = await import('node:fs');
        if (!fs.existsSync(directory)) {
          return { success: false, message: `目录不存在: ${directory}` };
        }
        const stats = fs.statSync(directory);
        if (!stats.isDirectory()) {
          return { success: false, message: `不是目录: ${directory}` };
        }
      } catch (err) {
        return { success: false, message: `目录检查失败: ${err}` };
      }
    }

    try {
      const spawnArgs = [...args];
      if (directory && this.config.supportsDirectory) {
        spawnArgs.push(directory);
      }

      this.currentProcess = spawn(this.config.command, spawnArgs, {
        detached,
        stdio: detached ? 'ignore' : 'pipe',
        cwd: directory || process.cwd(),
        env: { ...process.env, ...env }
      });

      if (detached && this.currentProcess.pid) {
        this.currentProcess.unref();
      }

      this.currentDirectory = directory || process.cwd();
      this.startTime = new Date();
      this.monitoredPids.add(this.currentProcess.pid!);

      // 等待确认启动
      await new Promise(resolve => setTimeout(resolve, 500));

      const pid = this.currentProcess.pid;
      const isRunning = this.isProcessRunning(pid!);

      if (isRunning) {
        return {
          success: true,
          pid,
          message: `✅ ${this.getName()} 已启动\n📁 目录: ${this.currentDirectory}\n🔢 PID: ${pid}`
        };
      } else {
        return {
          success: false,
          message: `启动失败：进程未正常运行`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `启动失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 停止 CLI 进程
   * @param options 停止选项
   */
  async stop(options: StopOptions = {}): Promise<{
    success: boolean;
    message: string;
    stoppedCount: number;
  }> {
    const { force = false, gracefulTimeout = 5000 } = options;
    let stoppedCount = 0;

    // 停止当前管理的进程
    if (this.currentProcess && this.currentProcess.pid) {
      const stopped = await this.killProcess(this.currentProcess.pid, force, gracefulTimeout);
      if (stopped) {
        stoppedCount++;
        this.monitoredPids.delete(this.currentProcess.pid);
      }
      this.currentProcess = null;
    }

    // 停止所有通过 pgrep 找到的进程
    const processes = await this.scanProcesses();
    for (const proc of processes) {
      const stopped = await this.killProcess(proc.pid, force, gracefulTimeout);
      if (stopped) {
        stoppedCount++;
        this.monitoredPids.delete(proc.pid);
      }
    }

    if (stoppedCount > 0) {
      this.startTime = null;
      this.currentDirectory = null;
      return {
        success: true,
        message: `💀 已停止 ${stoppedCount} 个 ${this.getName()} 进程`,
        stoppedCount
      };
    } else {
      return {
        success: true,
        message: `没有运行的 ${this.getName()} 进程`,
        stoppedCount: 0
      };
    }
  }

  /**
   * 切换到指定目录（重启进程）
   * @param directory 目标目录
   */
  async switchDirectory(directory: string): Promise<{
    success: boolean;
    pid?: number;
    message: string;
    error?: Error;
  }> {
    if (!this.config.supportsDirectory) {
      return {
        success: false,
        message: `${this.getName()} 不支持目录切换`
      };
    }

    // 先停止当前进程
    await this.stop({ force: false });
    await new Promise(resolve => setTimeout(resolve, 500));

    // 在新目录启动
    return this.start({ directory });
  }

  /**
   * 获取当前状态
   */
  async getStatus(): Promise<CLIProcessStatus & {
    managedCount: number;
    allProcesses: Array<{
      pid: number;
      cwd: string | null;
      isManaged: boolean;
    }>;
  }> {
    const processes = await this.scanProcesses();
    const currentPid = this.currentProcess?.pid || null;
    const currentCwd = await this.getCurrentWorkingDir();
    const uptime = this.startTime
      ? Math.floor((Date.now() - this.startTime.getTime()) / 1000)
      : 0;

    return {
      pid: currentPid,
      cwd: currentCwd || this.currentDirectory,
      startTime: this.startTime,
      isRunning: currentPid ? this.isProcessRunning(currentPid) : false,
      uptime,
      managedCount: this.monitoredPids.size,
      allProcesses: processes.map(p => ({
        pid: p.pid,
        cwd: p.cwd,
        isManaged: this.monitoredPids.has(p.pid)
      }))
    };
  }

  /**
   * 扫描所有匹配的进程
   */
  async scanProcesses(): Promise<Array<{ pid: number; cwd: string | null }>> {
    const processes: Array<{ pid: number; cwd: string | null }> = [];

    try {
      const { execSync } = await import('node:child_process');
      const output = execSync(
        `pgrep -f "${this.config.processPattern}" || true`,
        { encoding: 'utf-8', timeout: 5000 }
      );

      const pids = output.trim().split('\n').filter(p => p);

      for (const pidStr of pids) {
        const pid = parseInt(pidStr, 10);
        if (isNaN(pid)) continue;

        try {
          const cwdOutput = execSync(
            `lsof -p ${pid} 2>/dev/null | grep " cwd " | awk '{print $9}' || echo ''`,
            { encoding: 'utf-8', timeout: 2000 }
          );
          processes.push({ pid, cwd: cwdOutput.trim() || null });
        } catch {
          // 进程可能已退出
        }
      }
    } catch {
      // 没有进程运行
    }

    return processes;
  }

  /**
   * 获取当前工作目录
   */
  async getCurrentWorkingDir(): Promise<string | null> {
    try {
      const { execSync } = await import('node:child_process');
      const output = execSync(
        `lsof -c ${this.config.command} 2>/dev/null | grep " cwd " | head -1 | awk '{print $9}' || echo ''`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      return output.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * 检查进程是否运行中
   */
  protected isProcessRunning(pid: number): boolean {
    try {
      const { execSync } = require('node:child_process');
      execSync(`kill -0 ${pid} 2>/dev/null`, { timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 杀死指定进程
   */
  protected async killProcess(
    pid: number,
    force: boolean = false,
    gracefulTimeout: number = 5000
  ): Promise<boolean> {
    try {
      if (!this.isProcessRunning(pid)) {
        return false;
      }

      if (force) {
        process.kill(pid, 'SIGKILL');
      } else {
        // 先尝试优雅退出
        process.kill(pid, 'SIGTERM');
        // 等待优雅退出
        await new Promise(resolve => setTimeout(resolve, gracefulTimeout));
        // 如果还在运行，强制杀死
        if (this.isProcessRunning(pid)) {
          process.kill(pid, 'SIGKILL');
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取版本信息
   */
  async getVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(this.config.command, ['--version'], {
        timeout: 10000,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => {
        resolve(null);
      });
    });
  }
}
