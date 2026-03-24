export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CLIProviderConfig {
  enabled: boolean;
  provider: string;
  model?: string;
  timeout: number;
  extraArgs?: string[];
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
}

export interface TestResult {
  success: boolean;
  message: string;
}

export interface ProgressUpdate {
  stage: 'starting' | 'searching' | 'analyzing' | 'processing' | 'complete' | 'error';
  message: string;
  partialResult?: string;
  progress?: number;
}

export interface ProcessOptions {
  onProgress?: (update: ProgressUpdate) => void;
  onPartialResult?: (text: string) => void;
}

// 工作目录管理器接口
export interface WorkingDirectoryManager {
  getCurrentDirectory(): string | null;
}

// 全局工作目录管理器（由外部设置）
let globalWorkingDirectoryManager: WorkingDirectoryManager | null = null;

export function setWorkingDirectoryManager(manager: WorkingDirectoryManager): void {
  globalWorkingDirectoryManager = manager;
}

export function getWorkingDirectory(): string {
  return globalWorkingDirectoryManager?.getCurrentDirectory() || process.cwd();
}

export abstract class CLIProvider {
  protected config: CLIProviderConfig;

  constructor(config: CLIProviderConfig) {
    this.config = {
      timeout: 600000,
      ...config
    };
  }

  updateConfig(config: Partial<CLIProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): CLIProviderConfig {
    return { ...this.config };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  abstract getName(): string;
  abstract getDescription(): string;
  abstract getInstallCommand(): string;
  
  abstract processMessage(text: string, history?: Message[], options?: ProcessOptions): Promise<string | null>;
  abstract listAgents?(): Promise<Agent[]>;
  abstract testConnection(): Promise<TestResult>;
}
