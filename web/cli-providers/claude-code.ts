import { spawn } from 'node:child_process';
import { CLIProvider, Message, Agent, TestResult } from './base.ts';

export class ClaudeCodeProvider extends CLIProvider {
  getName(): string {
    return 'Claude Code';
  }

  getDescription(): string {
    return 'Claude Code - Anthropic Claude 官方 CLI';
  }

  getInstallCommand(): string {
    return 'npm install -g @anthropic-ai/claude-code';
  }

  async processMessage(text: string, history?: Message[]): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const args = [];
      
      if (this.config.model) {
        args.push('--model', this.config.model);
      }
      
      if (this.config.extraArgs) {
        args.push(...this.config.extraArgs);
      }
      
      // Claude Code 使用非交互模式
      args.push('--no-interactive');
      args.push(text);

      const claude = spawn('claude', args, {
        timeout: this.config.timeout,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
      });

      let output = '';
      let errorOutput = '';

      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      claude.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`Claude Code exited with code ${code}: ${errorOutput || output}`));
        }
      });

      claude.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          reject(new Error('Claude Code CLI not found. Run: npm install -g @anthropic-ai/claude-code'));
        } else {
          reject(err);
        }
      });
    });
  }

  async listAgents(): Promise<Agent[]> {
    return [
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: '最强大的 Claude 模型，适合复杂任务' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: '平衡性能和速度' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: '最快的响应，适合简单任务' }
    ];
  }

  async testConnection(): Promise<TestResult> {
    return new Promise((resolve) => {
      const claude = spawn('claude', ['--version'], {
        timeout: 10000,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';

      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.on('close', (code) => {
        if (code === 0) {
          resolve({ 
            success: true, 
            message: `Claude Code CLI 连接成功 (${output.trim()})` 
          });
        } else {
          resolve({ 
            success: false, 
            message: 'Claude Code CLI 测试失败' 
          });
        }
      });

      claude.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          resolve({ 
            success: false, 
            message: 'Claude Code CLI 未找到，请先安装: npm install -g @anthropic-ai/claude-code' 
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
