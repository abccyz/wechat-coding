import { spawn } from 'node:child_process';
import { CLIProvider, Message, Agent, TestResult } from './base.ts';

export class CodexProvider extends CLIProvider {
  getName(): string {
    return 'OpenAI Codex';
  }

  getDescription(): string {
    return 'OpenAI Codex - OpenAI 官方代码生成助手';
  }

  getInstallCommand(): string {
    return 'npm install -g @openai/codex';
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
      
      args.push(text);

      const codex = spawn('codex', args, {
        timeout: this.config.timeout,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
      });

      let output = '';
      let errorOutput = '';

      codex.stdout.on('data', (data) => {
        output += data.toString();
      });

      codex.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      codex.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`Codex exited with code ${code}: ${errorOutput || output}`));
        }
      });

      codex.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          reject(new Error('Codex CLI not found. Run: npm install -g @openai/codex'));
        } else {
          reject(err);
        }
      });
    });
  }

  async listAgents(): Promise<Agent[]> {
    return [
      { id: 'gpt-4o', name: 'GPT-4o', description: '最强大的多模态模型，适合复杂任务' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '快速且经济的模型，适合简单任务' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: '高性能模型，适合代码生成' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: '快速响应模型，适合日常问答' }
    ];
  }

  async testConnection(): Promise<TestResult> {
    return new Promise((resolve) => {
      const codex = spawn('codex', ['--version'], {
        timeout: 10000,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';

      codex.stdout.on('data', (data) => {
        output += data.toString();
      });

      codex.on('close', (code) => {
        if (code === 0) {
          resolve({ 
            success: true, 
            message: `Codex CLI 连接成功 (${output.trim()})` 
          });
        } else {
          resolve({ 
            success: false, 
            message: 'Codex CLI 测试失败' 
          });
        }
      });

      codex.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          resolve({ 
            success: false, 
            message: 'Codex CLI 未找到，请先安装: npm install -g @openai/codex' 
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
