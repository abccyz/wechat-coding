import { CLIConsoleManager, CLIConsoleConfig } from '../base.ts';

const AIDER_CONFIG: CLIConsoleConfig = {
  command: 'aider',
  installCommand: 'pip install aider-chat',
  processPattern: 'bin/aider$',
  supportsDirectory: true,
  defaultTimeout: 120000
};

export class AiderConsoleManager extends CLIConsoleManager {
  constructor() {
    super(AIDER_CONFIG);
  }

  getName(): string {
    return 'Aider';
  }

  getDescription(): string {
    return 'Aider - 支持多模型（GPT-4、Claude 等）的 AI 编程助手';
  }
}
