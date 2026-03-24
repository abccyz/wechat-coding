import { CLIConsoleManager, CLIConsoleConfig } from '../base.ts';

const COPILOT_CONFIG: CLIConsoleConfig = {
  command: 'gh',
  installCommand: 'gh extension install github/gh-copilot',
  processPattern: 'gh copilot',
  supportsDirectory: false, // Copilot 通过 gh CLI 运行，不直接管理
  defaultTimeout: 60000
};

export class CopilotConsoleManager extends CLIConsoleManager {
  constructor() {
    super(COPILOT_CONFIG);
  }

  getName(): string {
    return 'GitHub Copilot CLI';
  }

  getDescription(): string {
    return 'GitHub Copilot CLI - GitHub 官方 AI 编程助手';
  }

  // Copilot 不支持传统目录切换，覆盖方法
  async switchDirectory(): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message: 'GitHub Copilot CLI 不支持目录切换'
    };
  }
}
