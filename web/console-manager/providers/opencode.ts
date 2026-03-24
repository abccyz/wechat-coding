import { CLIConsoleManager, CLIConsoleConfig } from '../base.ts';

const OPENCODE_CONFIG: CLIConsoleConfig = {
  command: 'opencode',
  installCommand: 'npm install -g opencode',
  processPattern: 'bin/\\.opencode$',
  supportsDirectory: true,
  defaultTimeout: 120000
};

export class OpenCodeConsoleManager extends CLIConsoleManager {
  constructor() {
    super(OPENCODE_CONFIG);
  }

  getName(): string {
    return 'OpenCode';
  }

  getDescription(): string {
    return 'OpenCode - 支持多 Agent 的智能编程助手';
  }
}
