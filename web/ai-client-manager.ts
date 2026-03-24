import { EventEmitter } from 'events';
import { CLIProvider, CLIProviderConfig, ProcessOptions, Message } from './cli-providers/base.ts';
import { CLIProviderFactory } from './cli-providers/index.ts';
import { opencodeManager, SwitchCommand } from '../src/tools/opencode-manager.ts';

/**
 * AI 客户端状态
 */
export enum AIClientState {
  IDLE = 'idle',           // 空闲/未启动
  STARTING = 'starting',   // 启动中
  RUNNING = 'running',     // 运行中
  STOPPING = 'stopping',   // 停止中
  ERROR = 'error',         // 错误状态
  RESTARTING = 'restarting' // 重启中
}

/**
 * AI 客户端配置
 */
export interface AIClientConfig extends CLIProviderConfig {
  autoStart?: boolean;      // 是否自动启动
  restartOnError?: boolean; // 出错时是否自动重启
  maxRestartAttempts?: number; // 最大重启次数
  restartDelayMs?: number;  // 重启延迟
}

/**
 * AI 客户端状态信息
 */
export interface AIClientStatus {
  state: AIClientState;
  provider: string | null;
  model: string | null;
  pid: number | undefined;
  uptime: number;           // 运行时长（毫秒）
  lastError: string | null;
  restartAttempts: number;
  startTime: Date | null;
}

/**
 * AI 客户端管理器 - 统一封装 AI CLI 工具的生命周期管理
 * 
 * 功能：
 * - 启动/停止/重启 AI 客户端
 * - 进程状态监控
 * - 自动重连机制
 * - 统一消息处理接口
 */
export class AIClientManager extends EventEmitter {
  private config: AIClientConfig | null = null;
  private provider: CLIProvider | null = null;
  private state: AIClientState = AIClientState.IDLE;
  private startTime: Date | null = null;
  private restartAttempts = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;

  constructor() {
    super();
  }

  /**
   * 获取当前状态
   */
  async getStatus(): Promise<AIClientStatus> {
    return {
      state: this.state,
      provider: this.config?.provider || null,
      model: this.config?.model || null,
      pid: await this.getProcessId(),
      uptime: this.getUptime(),
      lastError: this.lastError,
      restartAttempts: this.restartAttempts,
      startTime: this.startTime
    };
  }

  /**
   * 配置 AI 客户端
   */
  configure(config: AIClientConfig): void {
    this.config = {
      ...config,
      autoStart: config.autoStart ?? false,
      restartOnError: config.restartOnError ?? true,
      maxRestartAttempts: config.maxRestartAttempts ?? 3,
      restartDelayMs: config.restartDelayMs ?? 5000
    };

    // 如果配置变更了 provider，需要重新创建实例
    if (this.provider && this.provider.getName() !== config.provider) {
      this.stop().catch(console.error);
      this.provider = null;
    }

    this.emit('configured', this.config);

    // 自动启动
    if (this.config.autoStart && this.config.enabled) {
      this.start().catch(console.error);
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): AIClientConfig | null {
    return this.config;
  }

  /**
   * 启动 AI 客户端
   */
  async start(): Promise<{ success: boolean; message: string; pid?: number }> {
    if (!this.config) {
      return { success: false, message: '未配置 AI 客户端' };
    }

    if (!this.config.enabled) {
      return { success: false, message: 'AI 客户端已禁用' };
    }

    if (this.state === AIClientState.RUNNING) {
      return { success: true, message: 'AI 客户端已在运行中', pid: await this.getProcessId() };
    }

    if (this.state === AIClientState.STARTING) {
      return { success: false, message: 'AI 客户端正在启动中' };
    }

    this.setState(AIClientState.STARTING);
    this.lastError = null;

    try {
      // 1. 创建 Provider 实例
      if (!this.provider || this.provider.getName() !== this.config.provider) {
        this.provider = CLIProviderFactory.createProvider(this.config);
      } else {
        this.provider.updateConfig(this.config);
      }

      // 2. 如果是 OpenCode，启动对应的 ConsoleManager 进程
      if (this.config.provider === 'opencode') {
        const result = await this.startOpenCodeProcess();
        if (!result.success) {
          throw new Error(result.message);
        }
      }

      // 3. 测试连接
      const testResult = await this.provider.testConnection();
      if (!testResult.success) {
        throw new Error(testResult.message || '连接测试失败');
      }

      // 4. 启动成功
      this.startTime = new Date();
      this.restartAttempts = 0;
      this.setState(AIClientState.RUNNING);

      const status = await this.getStatus();
      this.emit('started', status);

      return {
        success: true,
        message: `${this.provider.getName()} 启动成功`,
        pid: await this.getProcessId()
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastError = errorMessage;
      this.setState(AIClientState.ERROR);

      this.emit('error', { message: errorMessage, operation: 'start' });

      // 尝试自动重启
      if (this.config.restartOnError && this.restartAttempts < this.config.maxRestartAttempts!) {
        this.scheduleRestart();
      }

      return { success: false, message: `启动失败: ${errorMessage}` };
    }
  }

  /**
   * 停止 AI 客户端
   */
  async stop(options?: { force?: boolean; gracefulTimeout?: number }): Promise<{ success: boolean; message: string }> {
    if (this.state === AIClientState.IDLE) {
      return { success: true, message: 'AI 客户端已处于停止状态' };
    }

    if (this.state === AIClientState.STOPPING) {
      return { success: false, message: 'AI 客户端正在停止中' };
    }

    this.setState(AIClientState.STOPPING);

    // 清除重启定时器
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    try {
      // 停止 OpenCode 进程（如果是 OpenCode）
      if (this.config?.provider === 'opencode') {
        await this.stopOpenCodeProcess(options);
      }

      // 清理 Provider
      this.provider = null;
      this.startTime = null;
      this.restartAttempts = 0;
      this.lastError = null;

      this.setState(AIClientState.IDLE);
      this.emit('stopped');

      return { success: true, message: 'AI 客户端已停止' };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.setState(AIClientState.ERROR);
      return { success: false, message: `停止失败: ${errorMessage}` };
    }
  }

  /**
   * 重启 AI 客户端
   */
  async restart(): Promise<{ success: boolean; message: string; pid?: number }> {
    if (this.state === AIClientState.RESTARTING) {
      return { success: false, message: 'AI 客户端正在重启中' };
    }

    const previousState = this.state;
    this.setState(AIClientState.RESTARTING);
    this.emit('restarting');

    try {
      // 先停止
      const stopResult = await this.stop({ force: false, gracefulTimeout: 5000 });
      if (!stopResult.success && previousState === AIClientState.RUNNING) {
        // 如果停止失败但之前是运行状态，强制停止
        await this.stop({ force: true });
      }

      // 等待一小段时间确保进程完全终止
      await this.delay(1000);

      // 重新启动
      const startResult = await this.start();

      if (startResult.success) {
        this.emit('restarted', this.getStatus());
      }

      return startResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.setState(AIClientState.ERROR);
      return { success: false, message: `重启失败: ${errorMessage}` };
    }
  }

  /**
   * 处理消息
   * 统一的消息处理入口
   */
  async processMessage(
    text: string, 
    history?: Message[],
    options?: ProcessOptions
  ): Promise<string | null> {
    if (!this.provider || this.state !== AIClientState.RUNNING) {
      throw new Error('AI 客户端未启动');
    }

    try {
      this.emit('processing', { text });
      const result = await this.provider.processMessage(text, history, options);
      this.emit('processed', { text, result });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', { message: errorMessage, operation: 'processMessage' });
      throw error;
    }
  }

  /**
   * 获取可用的 Agents/模型列表
   */
  async listAgents(): Promise<Array<{ id: string; name: string; description?: string }>> {
    if (!this.provider) {
      return [];
    }

    if (this.provider.listAgents) {
      try {
        return await this.provider.listAgents();
      } catch (error) {
        console.error('Failed to list agents:', error);
        return [];
      }
    }

    return [];
  }

  /**
   * 切换工作目录（仅 OpenCode 支持）
   */
  async switchDirectory(directory: string): Promise<{ success: boolean; message: string; pid?: number }> {
    if (this.config?.provider !== 'opencode') {
      return { success: false, message: '仅 OpenCode 支持切换目录' };
    }

    try {
      const result = await opencodeManager.startInDirectory(directory);
      if (result.success) {
        this.emit('directoryChanged', { directory, pid: result.pid });
      }
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * 获取当前工作目录
   */
  getCurrentDirectory(): string | null {
    return opencodeManager.getCurrentDirectory();
  }

  /**
   * 执行控制台命令（仅 OpenCode 支持）
   */
  async executeCommand(command: SwitchCommand): Promise<string> {
    if (this.config?.provider !== 'opencode') {
      return '仅 OpenCode 支持控制台命令';
    }

    return await opencodeManager.executeCommand(command);
  }

  /**
   * 是否已启用
   */
  isEnabled(): boolean {
    return this.config?.enabled ?? false;
  }

  /**
   * 是否正在运行
   */
  isRunning(): boolean {
    return this.state === AIClientState.RUNNING;
  }

  /**
   * 获取 Provider 实例
   */
  getProvider(): CLIProvider | null {
    return this.provider;
  }

  // ============ 私有方法 ============

  private setState(state: AIClientState): void {
    const oldState = this.state;
    this.state = state;
    if (oldState !== state) {
      this.emit('stateChanged', { oldState, newState: state });
    }
  }

  private async getProcessId(): Promise<number | undefined> {
    if (this.config?.provider === 'opencode') {
      const pid = await opencodeManager.getCurrentPid();
      return pid ?? undefined;
    }
    return undefined;
  }

  private getUptime(): number {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime.getTime();
  }

  private async startOpenCodeProcess(): Promise<{ success: boolean; message: string; pid?: number }> {
    try {
      const result = await opencodeManager.startInDirectory(process.cwd());
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, message: errorMessage };
    }
  }

  private async stopOpenCodeProcess(options?: { force?: boolean; gracefulTimeout?: number }): Promise<void> {
    try {
      if (options?.force) {
        opencodeManager.killAllProcesses();
      } else {
        await opencodeManager.killOpenCode();
      }
    } catch (error) {
      console.error('Failed to stop OpenCode process:', error);
    }
  }

  private scheduleRestart(): void {
    if (this.restartTimer) return;

    this.restartAttempts++;
    const delay = this.config?.restartDelayMs ?? 5000;

    this.emit('restartScheduled', { attempt: this.restartAttempts, delay });

    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null;
      const result = await this.start();
      if (!result.success && this.restartAttempts < (this.config?.maxRestartAttempts ?? 3)) {
        this.scheduleRestart();
      }
    }, delay);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例实例
export const aiClientManager = new AIClientManager();
