import { spawn } from 'node:child_process';
import { CLIProvider, Message, Agent, TestResult } from './base.ts';

export class AiderProvider extends CLIProvider {
  getName(): string {
    return 'Aider';
  }

  getDescription(): string {
    return 'Aider - 支持多模型（GPT-4、Claude 等）的 AI 编程助手';
  }

  getInstallCommand(): string {
    return 'pip install aider-chat';
  }

  async processMessage(text: string, history?: Message[]): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const args = ['--message', text];
      
      // 支持指定模型
      if (this.config.model) {
        args.push('--model', this.config.model);
      }
      
      // 非交互模式
      args.push('--no-git', '--no-auto-commit');
      
      if (this.config.extraArgs) {
        args.push(...this.config.extraArgs);
      }

      const aider = spawn('aider', args, {
        timeout: this.config.timeout,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
      });

      let output = '';
      let errorOutput = '';

      aider.stdout.on('data', (data) => {
        output += data.toString();
      });

      aider.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      aider.on('close', (code) => {
        if (code === 0 || code === null) {
          // 清理输出，移除 ANSI 转义序列和多余空行
          const cleanOutput = output
            .replace(/\x1b\[[0-9;]*m/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          resolve(cleanOutput || '处理完成');
        } else {
          reject(new Error(`Aider exited with code ${code}: ${errorOutput || output}`));
        }
      });

      aider.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          reject(new Error('Aider not found. Run: pip install aider-chat'));
        } else {
          reject(err);
        }
      });
    });
  }

  async listAgents(): Promise<Agent[]> {
    return [
      { id: 'gpt-4', name: 'GPT-4', description: 'OpenAI GPT-4 模型' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'OpenAI GPT-4o 多模态模型' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'OpenAI GPT-4o Mini 快速模型' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Anthropic Claude 3 Opus' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: 'Anthropic Claude 3 Sonnet' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Anthropic Claude 3 Haiku' }
    ];
  }

  async testConnection(): Promise<TestResult> {
    return new Promise((resolve) => {
      const aider = spawn('aider', ['--version'], {
        timeout: 10000,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';

      aider.stdout.on('data', (data) => {
        output += data.toString();
      });

      aider.on('close', (code) => {
        if (code === 0) {
          resolve({ 
            success: true, 
            message: `Aider 连接成功 (${output.trim()})` 
          });
        } else {
          resolve({ 
            success: false, 
            message: 'Aider 测试失败' 
          });
        }
      });

      aider.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          resolve({ 
            success: false, 
            message: 'Aider 未找到，请先安装: pip install aider-chat' 
          });
        } else {
          resolve({ 
            success: false, 
            message: `错误: ${err.message}` 
          });
        }
      });
    });
  }
}
