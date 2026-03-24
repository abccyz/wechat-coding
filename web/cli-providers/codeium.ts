import { spawn } from 'node:child_process';
import { CLIProvider, Message, Agent, TestResult } from './base.ts';

export class CodeiumProvider extends CLIProvider {
  getName(): string {
    return 'Codeium';
  }

  getDescription(): string {
    return 'Codeium - 免费的 AI 编程助手，支持代码补全和生成';
  }

  getInstallCommand(): string {
    return 'npm install -g codeium';
  }

  async processMessage(text: string, history?: Message[]): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const args = [];
      
      // Codeium CLI 支持 chat 子命令
      args.push('chat');
      
      if (this.config.model) {
        args.push('--model', this.config.model);
      }
      
      if (this.config.extraArgs) {
        args.push(...this.config.extraArgs);
      }
      
      // 消息内容
      args.push(text);

      const codeium = spawn('codeium', args, {
        timeout: this.config.timeout,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
      });

      let output = '';
      let errorOutput = '';

      codeium.stdout.on('data', (data) => {
        output += data.toString();
      });

      codeium.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      codeium.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`Codeium exited with code ${code}: ${errorOutput || output}`));
        }
      });

      codeium.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          reject(new Error('Codeium CLI not found. Run: npm install -g codeium'));
        } else {
          reject(err);
        }
      });
    });
  }

  async listAgents(): Promise<Agent[]> {
    // Codeium 免费版通常使用默认模型
    // 专业版可能有更多选择
    return [
      { 
        id: 'default', 
        name: 'Codeium', 
        description: 'Codeium 默认模型' 
      },
      { 
        id: 'premium', 
        name: 'Codeium Premium', 
        description: 'Codeium 高级模型（需要订阅）' 
      }
    ];
  }

  async testConnection(): Promise<TestResult> {
    return new Promise((resolve) => {
      const codeium = spawn('codeium', ['--version'], {
        timeout: 10000,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';

      codeium.stdout.on('data', (data) => {
        output += data.toString();
      });

      codeium.on('close', (code) => {
        if (code === 0) {
          resolve({ 
            success: true, 
            message: `Codeium CLI 连接成功 (${output.trim()})` 
          });
        } else {
          resolve({ 
            success: false, 
            message: 'Codeium CLI 测试失败' 
          });
        }
      });

      codeium.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          resolve({ 
            success: false, 
            message: 'Codeium CLI 未找到，请先安装: npm install -g codeium' 
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
