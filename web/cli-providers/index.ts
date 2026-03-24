import { CLIProvider, CLIProviderConfig } from './base.ts';
import { OpenCodeProvider } from './opencode.ts';
import { CodexProvider } from './codex.ts';
import { ClaudeCodeProvider } from './claude-code.ts';
import { AiderProvider } from './aider.ts';
import { CopilotProvider } from './copilot.ts';
import { CodeiumProvider } from './codeium.ts';
import { TabbyProvider } from './tabby.ts';

export class CLIProviderFactory {
  static createProvider(config: CLIProviderConfig): CLIProvider {
    switch (config.provider) {
      case 'opencode':
        return new OpenCodeProvider(config);
      case 'codex':
        return new CodexProvider(config);
      case 'claude-code':
        return new ClaudeCodeProvider(config);
      case 'aider':
        return new AiderProvider(config);
      case 'copilot':
        return new CopilotProvider(config);
      case 'codeium':
        return new CodeiumProvider(config);
      case 'tabby':
        return new TabbyProvider(config);
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
      },
      {
        id: 'aider',
        name: 'Aider',
        description: 'Aider - 支持多模型（GPT-4、Claude 等）的 AI 编程助手',
        installCommand: 'pip install aider-chat'
      },
      {
        id: 'copilot',
        name: 'GitHub Copilot CLI',
        description: 'GitHub Copilot CLI - GitHub 官方 AI 编程助手',
        installCommand: 'gh extension install github/gh-copilot'
      },
      {
        id: 'codeium',
        name: 'Codeium',
        description: 'Codeium - 免费的 AI 编程助手，支持代码补全和生成',
        installCommand: 'npm install -g codeium'
      },
      {
        id: 'tabby',
        name: 'Tabby',
        description: 'Tabby - 自托管的 AI 编程助手',
        installCommand: 'docker run -it -p 8080:8080 -v $HOME/.tabby:/data tabbyml/tabby serve --model StarCoder-1B'
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
