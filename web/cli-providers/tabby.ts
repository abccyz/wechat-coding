import { spawn } from 'node:child_process';
import { CLIProvider, Message, Agent, TestResult, getWorkingDirectory } from './base.ts';

export class TabbyProvider extends CLIProvider {
  getName(): string {
    return 'Tabby';
  }

  getDescription(): string {
    return 'Tabby - 自托管的 AI 编程助手';
  }

  getInstallCommand(): string {
    return 'docker run -it -p 8080:8080 -v $HOME/.tabby:/data tabbyml/tabby serve --model StarCoder-1B';
  }

  async processMessage(text: string, history?: Message[]): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return new Promise((resolve, reject) => {
      // Tabby 使用 tabby 命令行工具
      // 可以通过 tabby chat 或 HTTP API 调用
      const args = ['chat'];
      
      if (this.config.model) {
        args.push('--model', this.config.model);
      }
      
      // 指定 Tabby 服务器地址（如果使用自托管）
      if (this.config.extraArgs) {
        args.push(...this.config.extraArgs);
      }
      
      // 消息内容
      args.push(text);

      const tabby = spawn('tabby', args, {
        timeout: this.config.timeout,
        cwd: getWorkingDirectory(),
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
      });

      let output = '';
      let errorOutput = '';

      tabby.stdout.on('data', (data) => {
        output += data.toString();
      });

      tabby.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      tabby.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`Tabby exited with code ${code}: ${errorOutput || output}`));
        }
      });

      tabby.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          reject(new Error('Tabby CLI not found. Please install Tabby: https://tabby.tabbyml.com/docs/installation/'));
        } else {
          reject(err);
        }
      });
    });
  }

  async listAgents(): Promise<Agent[]> {
    // Tabby 支持多种模型，用户需要在启动时指定
    return [
      { 
        id: 'StarCoder-1B', 
        name: 'StarCoder 1B', 
        description: '轻量级代码补全模型' 
      },
      { 
        id: 'StarCoder-3B', 
        name: 'StarCoder 3B', 
        description: '中等规模代码补全模型' 
      },
      { 
        id: 'StarCoder-7B', 
        name: 'StarCoder 7B', 
        description: '大规模代码补全模型（需要更多内存）' 
      },
      { 
        id: 'CodeLlama-7B', 
        name: 'CodeLlama 7B', 
        description: 'Meta CodeLlama 代码模型' 
      },
      { 
        id: 'DeepseekCoder-1.3B', 
        name: 'DeepseekCoder 1.3B', 
        description: 'Deepseek 代码模型（轻量）' 
      },
      { 
        id: 'DeepseekCoder-6.7B', 
        name: 'DeepseekCoder 6.7B', 
        description: 'Deepseek 代码模型（标准）' 
      }
    ];
  }

  async testConnection(): Promise<TestResult> {
    return new Promise((resolve) => {
      const tabby = spawn('tabby', ['--version'], {
        timeout: 10000,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';

      tabby.stdout.on('data', (data) => {
        output += data.toString();
      });

      tabby.on('close', (code) => {
        if (code === 0) {
          resolve({ 
            success: true, 
            message: `Tabby CLI 连接成功 (${output.trim()})` 
          });
        } else {
          resolve({ 
            success: false, 
            message: 'Tabby CLI 测试失败' 
          });
        }
      });

      tabby.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          resolve({ 
            success: false, 
            message: 'Tabby CLI 未找到，请先安装: https://tabby.tabbyml.com/docs/installation/' 
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
