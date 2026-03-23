import { spawn } from 'node:child_process';
import { CLIProvider, Message, Agent, TestResult } from './base.ts';

export class OpenCodeProvider extends CLIProvider {
  getName(): string {
    return 'OpenCode';
  }

  getDescription(): string {
    return 'OpenCode - 支持多 Agent 的智能编程助手';
  }

  getInstallCommand(): string {
    return 'npm install -g opencode';
  }

  async processMessage(text: string, history?: Message[]): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const args = ['run', '--format', 'json'];
      
      if (this.config.model) {
        args.push('--agent', this.config.model);
      }
      
      if (this.config.extraArgs) {
        args.push(...this.config.extraArgs);
      }

      console.log(`[OpenCode] Running: opencode ${args.join(' ')}`);
      console.log(`[OpenCode] Input: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);

      const opencode = spawn('opencode', args, {
        timeout: this.config.timeout,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
      });

      let output = '';
      let errorOutput = '';
      const textParts: string[] = [];

      // Send input via stdin
      opencode.stdin.write(text);
      opencode.stdin.end();

      opencode.stdout.on('data', (data) => {
        const str = data.toString();
        output += str;
        
        const lines = str.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line);
              if (event.type === 'text' && event.part?.text) {
                textParts.push(event.part.text);
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        }
      });

      opencode.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      const timeout = setTimeout(() => {
        opencode.kill('SIGTERM');
        if (textParts.length > 0) {
          resolve(textParts.join(''));
        } else {
          reject(new Error('OpenCode CLI timeout'));
        }
      }, this.config.timeout);

      opencode.on('close', (code) => {
        clearTimeout(timeout);
        
        if (textParts.length > 0) {
          resolve(textParts.join(''));
        } else if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`OpenCode exited with code ${code}: ${errorOutput || 'Unknown error'}`));
        }
      });

      opencode.on('error', (err) => {
        clearTimeout(timeout);
        if (err.message.includes('ENOENT')) {
          reject(new Error('OpenCode CLI not found. Run: npm install -g opencode'));
        } else {
          reject(err);
        }
      });
    });
  }

  async listAgents(): Promise<Agent[]> {
    const agentDescriptions: Record<string, string> = {
      build: '构建专家 - 处理代码编译、构建和打包任务',
      compaction: '代码整理 - 压缩、优化和整理代码结构',
      explore: '探索分析 - 搜索代码库、分析项目结构',
      general: '通用助手 - 日常问答和通用任务处理',
      plan: '规划专家 - 复杂任务分解和规划',
      summary: '摘要生成 - 生成代码摘要和文档',
      title: '标题生成 - 生成提交信息和标题'
    };

    return new Promise((resolve, reject) => {
      const opencode = spawn('opencode', ['agent', 'list'], {
        timeout: 10000,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';
      let errorOutput = '';

      opencode.stdout.on('data', (data) => {
        output += data.toString();
      });

      opencode.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      opencode.on('close', (code) => {
        if (code === 0 || (code === null && output)) {
          try {
            const agents: Agent[] = [];
            const lines = output.trim().split('\n');
            
            for (const line of lines) {
              const trimmed = line.trim();
              const match = trimmed.match(/^(\w+)\s*\((\w+)\)$/);
              if (match) {
                const name = match[1];
                const type = match[2];
                agents.push({
                  id: name,
                  name: `${name} (${type === 'primary' ? '主' : '子'})`,
                  description: agentDescriptions[name] || `OpenCode ${type} agent`
                });
              }
            }
            
            resolve(agents);
          } catch {
            resolve([]);
          }
        } else {
          reject(new Error(`Failed to list agents: ${errorOutput || output}`));
        }
      });

      opencode.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          reject(new Error('OpenCode CLI not found'));
        } else {
          reject(err);
        }
      });
    });
  }

  async testConnection(): Promise<TestResult> {
    return new Promise((resolve) => {
      const opencode = spawn('opencode', ['--version'], {
        timeout: 10000,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';

      opencode.stdout.on('data', (data) => {
        output += data.toString();
      });

      opencode.on('close', (code) => {
        if (code === 0) {
          resolve({ 
            success: true, 
            message: `OpenCode CLI 连接成功 (${output.trim()})` 
          });
        } else {
          resolve({ 
            success: false, 
            message: 'OpenCode CLI 测试失败' 
          });
        }
      });

      opencode.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          resolve({ 
            success: false, 
            message: 'OpenCode CLI 未找到，请先安装: npm install -g opencode' 
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
