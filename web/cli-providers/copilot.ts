import { spawn } from 'node:child_process';
import { CLIProvider, Message, Agent, TestResult } from './base.ts';

export class CopilotProvider extends CLIProvider {
  getName(): string {
    return 'GitHub Copilot CLI';
  }

  getDescription(): string {
    return 'GitHub Copilot CLI - GitHub 官方 AI 编程助手';
  }

  getInstallCommand(): string {
    return 'gh extension install github/gh-copilot';
  }

  async processMessage(text: string, history?: Message[]): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return new Promise((resolve, reject) => {
      // GitHub Copilot CLI 使用 gh copilot suggest 命令
      const args = ['copilot', 'suggest', '-t', 'shell'];
      
      if (this.config.extraArgs) {
        args.push(...this.config.extraArgs);
      }
      
      // 将用户输入作为描述
      args.push('--', text);

      const gh = spawn('gh', args, {
        timeout: this.config.timeout,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
      });

      let output = '';
      let errorOutput = '';

      gh.stdout.on('data', (data) => {
        output += data.toString();
      });

      gh.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      gh.on('close', (code) => {
        if (code === 0) {
          // 清理输出
          const cleanOutput = output.trim();
          resolve(cleanOutput || '无输出');
        } else {
          reject(new Error(`GitHub Copilot exited with code ${code}: ${errorOutput || output}`));
        }
      });

      gh.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          reject(new Error('GitHub CLI not found. Please install GitHub CLI first: https://cli.github.com/'));
        } else {
          reject(err);
        }
      });
    });
  }

  async listAgents(): Promise<Agent[]> {
    // GitHub Copilot CLI 主要提供 shell 命令建议
    // 它不像其他工具那样有多个模型选择
    return [
      { 
        id: 'copilot', 
        name: 'GitHub Copilot', 
        description: 'GitHub Copilot 命令建议助手' 
      }
    ];
  }

  async testConnection(): Promise<TestResult> {
    return new Promise((resolve) => {
      // 检查 gh 是否安装
      const gh = spawn('gh', ['--version'], {
        timeout: 10000,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';
      let errorOutput = '';

      gh.stdout.on('data', (data) => {
        output += data.toString();
      });

      gh.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      gh.on('close', async (code) => {
        if (code !== 0) {
          resolve({ 
            success: false, 
            message: 'GitHub CLI 未找到，请先安装: https://cli.github.com/' 
          });
          return;
        }

        // 检查 copilot 扩展是否安装
        const copilotCheck = spawn('gh', ['copilot', '--version'], {
          timeout: 10000,
          env: { ...process.env, FORCE_COLOR: '0' }
        });

        let copilotOutput = '';

        copilotCheck.stdout.on('data', (data) => {
          copilotOutput += data.toString();
        });

        copilotCheck.on('close', (copilotCode) => {
          if (copilotCode === 0) {
            resolve({ 
              success: true, 
              message: `GitHub Copilot CLI 连接成功 (${copilotOutput.trim()})` 
            });
          } else {
            resolve({ 
              success: false, 
              message: 'GitHub Copilot 扩展未安装，请运行: gh extension install github/gh-copilot' 
            });
          }
        });

        copilotCheck.on('error', () => {
          resolve({ 
            success: false, 
            message: 'GitHub Copilot 扩展未安装，请运行: gh extension install github/gh-copilot' 
          });
        });
      });

      gh.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          resolve({ 
            success: false, 
            message: 'GitHub CLI 未找到，请先安装: https://cli.github.com/' 
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
