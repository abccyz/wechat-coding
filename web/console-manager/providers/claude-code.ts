import { CLIConsoleManager, CLIConsoleConfig } from '../base.ts';

const CLAUDE_CODE_CONFIG: CLIConsoleConfig = {
  command: 'claude',
  installCommand: 'npm install -g @anthropic-ai/claude-code',
  processPattern: 'bin/claude$',
  supportsDirectory: true,
  defaultTimeout: 120000
};

export class ClaudeCodeConsoleManager extends CLIConsoleManager {
  constructor() {
    super(CLAUDE_CODE_CONFIG);
  }

  getName(): string {
    return 'Claude Code';
  }

  getDescription(): string {
    return 'Claude Code - Anthropic Claude 官方 CLI';
  }
}
