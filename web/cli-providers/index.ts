import { CLIProvider, CLIProviderConfig } from './base.ts';
import { OpenCodeProvider } from './opencode.ts';
import { CodexProvider } from './codex.ts';
import { ClaudeCodeProvider } from './claude-code.ts';

export class CLIProviderFactory {
  static createProvider(config: CLIProviderConfig): CLIProvider {
    switch (config.provider) {
      case 'opencode':
        return new OpenCodeProvider(config);
      case 'codex':
        return new CodexProvider(config);
      case 'claude-code':
        return new ClaudeCodeProvider(config);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  static getAvailableProviders(): { id: string; name: string; description: string; installCommand: string }[] {
    return [
      {
        id: 'opencode',
        name: 'OpenCode',
        description: 'OpenCode - 支持多 Agent 的智能编程助手',
        installCommand: 'npm install -g opencode'
      },
      {
        id: 'codex',
        name: 'OpenAI Codex',
        description: 'OpenAI Codex - OpenAI 官方代码生成助手',
        installCommand: 'npm install -g @openai/codex'
      },
      {
        id: 'claude-code',
        name: 'Claude Code',
        description: 'Claude Code - Anthropic Claude 官方 CLI',
        installCommand: 'npm install -g @anthropic-ai/claude-code'
      }
    ];
  }
}

let globalProvider: CLIProvider | null = null;

export function getCLIProvider(): CLIProvider | null {
  return globalProvider;
}

export function setCLIProvider(provider: CLIProvider | null): void {
  globalProvider = provider;
}

export function createCLIProvider(config: CLIProviderConfig): CLIProvider {
  globalProvider = CLIProviderFactory.createProvider(config);
  return globalProvider;
}
