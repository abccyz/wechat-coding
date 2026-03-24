import { CLIConsoleManager } from './base.ts';
import { OpenCodeConsoleManager } from './providers/opencode.ts';
import { ClaudeCodeConsoleManager } from './providers/claude-code.ts';
import { CodexConsoleManager } from './providers/codex.ts';
import { AiderConsoleManager } from './providers/aider.ts';
import { CopilotConsoleManager } from './providers/copilot.ts';
import { CodeiumConsoleManager } from './providers/codeium.ts';
import { TabbyConsoleManager } from './providers/tabby.ts';

export type ConsoleManagerType = 
  | 'opencode' 
  | 'claude-code' 
  | 'codex' 
  | 'aider' 
  | 'copilot' 
  | 'codeium' 
  | 'tabby';

export class ConsoleManagerFactory {
  static createManager(type: ConsoleManagerType): CLIConsoleManager {
    switch (type) {
      case 'opencode':
        return new OpenCodeConsoleManager();
      case 'claude-code':
        return new ClaudeCodeConsoleManager();
      case 'codex':
        return new CodexConsoleManager();
      case 'aider':
        return new AiderConsoleManager();
      case 'copilot':
        return new CopilotConsoleManager();
      case 'codeium':
        return new CodeiumConsoleManager();
      case 'tabby':
        return new TabbyConsoleManager();
      default:
        throw new Error(`Unknown console manager type: ${type}`);
    }
  }

  static getAvailableManagers(): Array<{
    type: ConsoleManagerType;
    name: string;
    description: string;
    installCommand: string;
  }> {
    return [
      {
        type: 'opencode',
        name: 'OpenCode',
        description: 'OpenCode - 支持多 Agent 的智能编程助手',
        installCommand: 'npm install -g opencode'
      },
      {
        type: 'claude-code',
        name: 'Claude Code',
        description: 'Claude Code - Anthropic Claude 官方 CLI',
        installCommand: 'npm install -g @anthropic-ai/claude-code'
      },
      {
        type: 'codex',
        name: 'OpenAI Codex',
        description: 'OpenAI Codex - OpenAI 官方代码生成助手',
        installCommand: 'npm install -g @openai/codex'
      },
      {
        type: 'aider',
        name: 'Aider',
        description: 'Aider - 支持多模型的 AI 编程助手',
        installCommand: 'pip install aider-chat'
      },
      {
        type: 'copilot',
        name: 'GitHub Copilot CLI',
        description: 'GitHub Copilot CLI - GitHub 官方 AI 编程助手',
        installCommand: 'gh extension install github/gh-copilot'
      },
      {
        type: 'codeium',
        name: 'Codeium',
        description: 'Codeium - 免费的 AI 编程助手',
        installCommand: 'npm install -g codeium'
      },
      {
        type: 'tabby',
        name: 'Tabby',
        description: 'Tabby - 自托管的 AI 编程助手',
        installCommand: 'docker run -it -p 8080:8080 tabbyml/tabby'
      }
    ];
  }
}
