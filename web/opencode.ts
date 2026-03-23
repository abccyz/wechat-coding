/**
 * OpenCode Integration Module
 * 集成 OpenCode API，将微信消息转发到 OpenCode 处理
 */

import { IncomingMessage } from '../src/types.js';

export interface OpenCodeConfig {
  /** OpenCode API URL */
  apiUrl: string;
  /** API Key */
  apiKey: string;
  /** Agent ID */
  agentId?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 超时时间（毫秒） */
  timeout: number;
}

export interface OpenCodeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OpenCodeRequest {
  messages: OpenCodeMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface OpenCodeResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class OpenCodeIntegration {
  private config: OpenCodeConfig;
  private conversationHistory: Map<string, OpenCodeMessage[]> = new Map();

  constructor(config: OpenCodeConfig) {
    this.config = {
      timeout: 60000,
      ...config
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<OpenCodeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): OpenCodeConfig {
    return { ...this.config };
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.config.apiUrl && !!this.config.apiKey;
  }

  /**
   * 处理微信消息，发送到 OpenCode
   */
  async processMessage(msg: IncomingMessage): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const userId = msg.userId;
    const userMessage: OpenCodeMessage = {
      role: 'user',
      content: msg.text
    };

    // 获取或创建对话历史
    let history = this.conversationHistory.get(userId) || [];
    
    // 如果对话太长，截断保留最近 10 轮
    if (history.length > 20) {
      history = history.slice(-20);
    }

    // 添加用户消息
    history.push(userMessage);

    // 构建请求消息
    const messages: OpenCodeMessage[] = [];
    
    // 添加系统提示词
    if (this.config.systemPrompt) {
      messages.push({
        role: 'system',
        content: this.config.systemPrompt
      });
    }
    
    messages.push(...history);

    try {
      const request: OpenCodeRequest = {
        messages,
        stream: false,
        temperature: 0.7,
        max_tokens: 2000
      };

      const response = await this.sendRequest(request);
      
      if (response.choices && response.choices.length > 0) {
        const assistantMessage = response.choices[0].message.content;
        
        // 保存 assistant 回复到历史
        history.push({
          role: 'assistant',
          content: assistantMessage
        });
        
        this.conversationHistory.set(userId, history);
        
        return assistantMessage;
      }
      
      return null;
    } catch (error) {
      console.error('[OpenCode] Error processing message:', error);
      return '抱歉，处理消息时出错了，请稍后重试。';
    }
  }

  /**
   * 发送请求到 OpenCode API
   */
  private async sendRequest(request: OpenCodeRequest): Promise<OpenCodeResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Agent-Id': this.config.agentId || ''
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`OpenCode API error: ${response.status} ${response.statusText}`);
      }

      return await response.json() as OpenCodeResponse;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * 清除用户的对话历史
   */
  clearHistory(userId: string): void {
    this.conversationHistory.delete(userId);
  }

  /**
   * 获取用户的对话历史
   */
  getHistory(userId: string): OpenCodeMessage[] {
    return this.conversationHistory.get(userId) || [];
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config.apiUrl || !this.config.apiKey) {
      return { success: false, message: 'API URL 和 API Key 不能为空' };
    }

    try {
      const request: OpenCodeRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      };

      await this.sendRequest(request);
      return { success: true, message: '连接成功' };
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : '连接失败' 
      };
    }
  }
}

// 全局实例
let globalIntegration: OpenCodeIntegration | null = null;

export function getOpenCodeIntegration(): OpenCodeIntegration | null {
  return globalIntegration;
}

export function setOpenCodeIntegration(integration: OpenCodeIntegration | null): void {
  globalIntegration = integration;
}

export function createOpenCodeIntegration(config: OpenCodeConfig): OpenCodeIntegration {
  globalIntegration = new OpenCodeIntegration(config);
  return globalIntegration;
}
