import { spawn } from 'node:child_process';
import { IncomingMessage } from '../src/types.js';

export interface OpenCodeCLIConfig {
  enabled: boolean;
  agentId?: string;
  systemPrompt?: string;
  timeout: number;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
}

export class OpenCodeCLIIntegration {
  private config: OpenCodeCLIConfig;
  private conversationHistory: Map<string, { role: string; content: string }[]> = new Map();

  constructor(config: OpenCodeCLIConfig) {
    this.config = {
      timeout: 120000,
      ...config
    };
  }

  updateConfig(config: Partial<OpenCodeCLIConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): OpenCodeCLIConfig {
    return { ...this.config };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  static async listAgents(): Promise<Agent[]> {
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
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              const match = line.match(/^(\w+)\s*\((\w+)\)$/);
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

  async processMessage(msg: IncomingMessage): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const userId = msg.userId;
    const userMessage = { role: 'user', content: msg.text };

    let history = this.conversationHistory.get(userId) || [];
    if (history.length > 20) {
      history = history.slice(-20);
    }
    history.push(userMessage);

    const messages: { role: string; content: string }[] = [];
    if (this.config.systemPrompt) {
      messages.push({ role: 'system', content: this.config.systemPrompt });
    }
    messages.push(...history);

    try {
      const response = await this.callOpenCodeCLI(messages);
      
      if (response) {
        history.push({ role: 'assistant', content: response });
        this.conversationHistory.set(userId, history);
        return response;
      }
      
      return null;
    } catch (error) {
      console.error('[OpenCode CLI] Error:', error);
      return '抱歉，处理消息时出错了，请稍后重试。';
    }
  }

  private async callOpenCodeCLI(messages: { role: string; content: string }[]): Promise<string> {
    const args = ['run'];
    
    if (this.config.agentId) {
      args.push('--agent', this.config.agentId);
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
      args.push(lastMessage.content);
    }

    return new Promise((resolve, reject) => {
      const opencode = spawn('opencode', args, {
        timeout: this.config.timeout,
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
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`OpenCode CLI exited with code ${code}: ${errorOutput || output}`));
        }
      });

      opencode.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          reject(new Error('OpenCode CLI not found. Please install it first: npm install -g opencode'));
        } else {
          reject(err);
        }
      });

      setTimeout(() => {
        opencode.kill();
        reject(new Error('OpenCode CLI timeout'));
      }, this.config.timeout);
    });
  }

  async sendDirectMessage(text: string): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('OpenCode CLI is not enabled');
    }

    const args = ['run'];
    if (this.config.agentId) {
      args.push('--agent', this.config.agentId);
    }
    args.push(text);

    return new Promise((resolve, reject) => {
      const opencode = spawn('opencode', args, {
        timeout: this.config.timeout,
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
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`OpenCode CLI exited with code ${code}: ${errorOutput || output}`));
        }
      });

      opencode.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          reject(new Error('OpenCode CLI not found. Please install it first: npm install -g opencode'));
        } else {
          reject(err);
        }
      });

      setTimeout(() => {
        opencode.kill();
        reject(new Error('OpenCode CLI timeout'));
      }, this.config.timeout);
    });
  }

  clearHistory(userId: string): void {
    this.conversationHistory.delete(userId);
  }

  getHistory(userId: string): { role: string; content: string }[] {
    return this.conversationHistory.get(userId) || [];
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const opencode = spawn('opencode', ['--version'], {
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
        if (code === 0) {
          const version = output.trim();
          resolve({ 
            success: true, 
            message: `OpenCode CLI 连接成功 (${version})` 
          });
        } else {
          resolve({ 
            success: false, 
            message: `OpenCode CLI 测试失败: ${errorOutput || '未知错误'}` 
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

      setTimeout(() => {
        opencode.kill();
        resolve({ 
          success: false, 
          message: 'OpenCode CLI 连接超时' 
        });
      }, 10000);
    });
  }
}

let globalIntegration: OpenCodeCLIIntegration | null = null;

export function getOpenCodeCLIIntegration(): OpenCodeCLIIntegration | null {
  return globalIntegration;
}

export function setOpenCodeCLIIntegration(integration: OpenCodeCLIIntegration | null): void {
  globalIntegration = integration;
}

export function createOpenCodeCLIIntegration(config: OpenCodeCLIConfig): OpenCodeCLIIntegration {
  globalIntegration = new OpenCodeCLIIntegration(config);
  return globalIntegration;
}
