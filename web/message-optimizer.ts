/**
 * 微信消息发送优化器
 * 支持分段发送、状态推送、智能合并
 */

import { WeixinBot } from '../src/index.js';

export interface MessageChunk {
  text: string;
  isFirst: boolean;
  isLast: boolean;
  chunkIndex: number;
  totalChunks: number;
}

export interface SendProgress {
  stage: 'thinking' | 'processing' | 'sending' | 'complete';
  message?: string;
  progress?: number;
}

export class WechatMessageOptimizer {
  private bot: WeixinBot;
  private maxMessageLength: number;
  private typingInterval: NodeJS.Timeout | null = null;

  constructor(bot: WeixinBot, maxMessageLength = 2000) {
    this.bot = bot;
    this.maxMessageLength = maxMessageLength;
  }

  /**
   * 智能分段文本
   */
  chunkText(text: string): MessageChunk[] {
    if (text.length <= this.maxMessageLength) {
      return [{
        text,
        isFirst: true,
        isLast: true,
        chunkIndex: 1,
        totalChunks: 1
      }];
    }

    const chunks: MessageChunk[] = [];
    const sentences = this.splitIntoSentences(text);
    let currentChunk = '';
    let chunkIndex = 0;

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > this.maxMessageLength) {
        if (currentChunk) {
          chunkIndex++;
          chunks.push({
            text: currentChunk.trim(),
            isFirst: chunkIndex === 1,
            isLast: false,
            chunkIndex,
            totalChunks: 0 // 暂时未知
          });
          currentChunk = '';
        }
      }
      currentChunk += sentence;
    }

    if (currentChunk) {
      chunkIndex++;
      chunks.push({
        text: currentChunk.trim(),
        isFirst: chunkIndex === 1,
        isLast: true,
        chunkIndex,
        totalChunks: chunkIndex
      });
    }

    // 更新 totalChunks
    chunks.forEach(chunk => {
      chunk.totalChunks = chunkIndex;
    });

    return chunks;
  }

  /**
   * 按语义分割句子
   */
  private splitIntoSentences(text: string): string[] {
    // 匹配中文和英文的句子结束符
    const sentenceRegex = /[^。！？.!?]+[。！？.!?]+/g;
    const sentences = text.match(sentenceRegex) || [text];
    
    // 如果还有剩余文本（不以标点结尾），添加到最后
    const lastMatch = sentences[sentences.length - 1];
    const lastIndex = text.lastIndexOf(lastMatch) + lastMatch.length;
    if (lastIndex < text.length) {
      sentences.push(text.slice(lastIndex));
    }
    
    return sentences;
  }

  /**
   * 开始持续发送 typing 状态
   */
  startTyping(userId: string): void {
    this.stopTyping();
    // 每20秒发送一次 typing 状态（微信最长显示25秒）
    this.typingInterval = setInterval(async () => {
      try {
        await this.bot.sendTyping(userId);
      } catch {
        // 忽略错误
      }
    }, 20000);
    
    // 立即发送一次
    this.bot.sendTyping(userId).catch(() => {});
  }

  /**
   * 停止 typing 状态
   */
  stopTyping(): void {
    if (this.typingInterval) {
      clearInterval(this.typingInterval);
      this.typingInterval = null;
    }
  }

  /**
   * 发送带进度通知的流式回复
   */
  async sendStreamingResponse(
    userId: string,
    contextToken: string,
    generateResponse: () => Promise<string>,
    onProgress: (progress: SendProgress) => void
  ): Promise<void> {
    // 阶段1：开始处理
    onProgress({ stage: 'thinking', message: '思考中...' });
    this.startTyping(userId);

    try {
      // 阶段2：生成回复
      onProgress({ stage: 'processing', message: '生成回复中...', progress: 0 });
      const response = await generateResponse();
      
      // 阶段3：智能分段
      const chunks = this.chunkText(response);
      const totalChunks = chunks.length;
      
      if (totalChunks === 1) {
        // 单条消息直接发送
        onProgress({ stage: 'sending', message: '发送中...', progress: 100 });
        await this.bot.send(userId, response);
        onProgress({ stage: 'complete', message: '发送完成' });
      } else {
        // 多条消息分段发送
        onProgress({ stage: 'sending', message: `共${totalChunks}条消息，开始发送...`, progress: 0 });
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const progress = Math.round(((i + 1) / chunks.length) * 100);
          
          // 发送分段指示（第一条和间隔消息）
          if (i > 0 && i % 3 === 0) {
            onProgress({ 
              stage: 'sending', 
              message: `发送中 (${i + 1}/${totalChunks})...`, 
              progress 
            });
          }
          
          // 添加分段标记
          let textToSend = chunk.text;
          if (totalChunks > 1) {
            if (i === 0) {
              textToSend = `📄 (${i + 1}/${totalChunks})\n${chunk.text}`;
            } else if (i === chunks.length - 1) {
              textToSend = `(${i + 1}/${totalChunks}) ✅\n${chunk.text}`;
            } else {
              textToSend = `(${i + 1}/${totalChunks})\n${chunk.text}`;
            }
          }
          
          await this.bot.send(userId, textToSend);
          
          // 消息间隔，避免触发频率限制
          if (i < chunks.length - 1) {
            await this.delay(1000);
          }
        }
        
        onProgress({ stage: 'complete', message: '发送完成' });
      }
    } finally {
      this.stopTyping();
    }
  }

  /**
   * 发送处理状态消息（阶段性更新）
   */
  async sendStatusUpdate(
    userId: string,
    status: string
  ): Promise<void> {
    try {
      // 使用特殊前缀标记状态消息
      await this.bot.send(userId, `⏳ ${status}`);
    } catch (err) {
      console.error('[Status Update] Failed:', err);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
