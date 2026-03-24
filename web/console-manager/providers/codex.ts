import { CLIConsoleManager, CLIConsoleConfig } from '../base.ts';

const CODEX_CONFIG: CLIConsoleConfig = {
  command: 'codex',
  installCommand: 'npm install -g @openai/codex',
  processPattern: 'bin/codex$',
  supportsDirectory: true,
  defaultTimeout: 120000
};

export class CodexConsoleManager extends CLIConsoleManager {
  constructor() {
    super(CODEX_CONFIG);
  }

  getName(): string {
    return 'OpenAI Codex';
  }

  getDescription(): string {
    return 'OpenAI Codex - OpenAI 官方代码生成助手';
  }
}
