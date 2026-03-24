import { CLIConsoleManager, CLIConsoleConfig } from '../base.ts';

const CODEIUM_CONFIG: CLIConsoleConfig = {
  command: 'codeium',
  installCommand: 'npm install -g codeium',
  processPattern: 'bin/codeium$',
  supportsDirectory: false, // Codeium 主要是编辑器扩展
  defaultTimeout: 60000
};

export class CodeiumConsoleManager extends CLIConsoleManager {
  constructor() {
    super(CODEIUM_CONFIG);
  }

  getName(): string {
    return 'Codeium';
  }

  getDescription(): string {
    return 'Codeium - 免费的 AI 编程助手';
  }

  // Codeium 不支持目录切换
  async switchDirectory(): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message: 'Codeium 不支持目录切换'
    };
  }
}
