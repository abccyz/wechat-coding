import { AIProcessTracker, AIProcessStage } from './ai-process-tracker.ts';
import { ProcessOptions, Message } from './cli-providers/base.ts';

/**
 * Provider 进度适配器 - 为不支持原生进度的 Provider 提供模拟进度
 * 
 * 功能：
 * 1. 基于预估时间定时推送进度
 * 2. 解析 stdout 内容推断阶段
 * 3. 为所有 Provider 统一提供进度接口
 */
export class ProviderProgressAdapter {
  private tracker: AIProcessTracker;
  private provider: string;
  private startTime: number;
  private progressTimer: NodeJS.Timeout | null = null;
  private outputBuffer: string = '';
  private lastOutputLength: number = 0;
  private isRunning: boolean = false;

  // 各 Provider 的预估处理时间（秒）
  private static estimatedTimes: Record<string, { min: number; max: number; stages: AIProcessStage[] }> = {
    'claude-code': { min: 30, max: 120, stages: [AIProcessStage.ANALYZING, AIProcessStage.PROCESSING, AIProcessStage.GENERATING] },
    'codex': { min: 20, max: 90, stages: [AIProcessStage.ANALYZING, AIProcessStage.PROCESSING, AIProcessStage.GENERATING] },
    'aider': { min: 30, max: 180, stages: [AIProcessStage.ANALYZING, AIProcessStage.PROCESSING, AIProcessStage.GENERATING, AIProcessStage.EXECUTING] },
    'copilot': { min: 15, max: 60, stages: [AIProcessStage.ANALYZING, AIProcessStage.GENERATING] },
    'codeium': { min: 10, max: 45, stages: [AIProcessStage.ANALYZING, AIProcessStage.GENERATING] },
    'tabby': { min: 15, max: 60, stages: [AIProcessStage.ANALYZING, AIProcessStage.GENERATING] },
    'opencode': { min: 30, max: 300, stages: [AIProcessStage.PLANNING, AIProcessStage.SEARCHING, AIProcessStage.ANALYZING, AIProcessStage.PROCESSING, AIProcessStage.GENERATING] }
  };

  // 阶段推断关键字
  private static stageKeywords: Record<string, Partial<Record<AIProcessStage, string[]>>> = {
    'claude-code': {
      [AIProcessStage.SEARCHING]: ['search', 'find', 'locate', 'grep', 'find'],
      [AIProcessStage.ANALYZING]: ['analyze', 'thinking', 'consider', 'let me', 'I\'ll'],
      [AIProcessStage.PROCESSING]: ['process', 'handle', 'work'],
      [AIProcessStage.GENERATING]: ['generate', 'create', 'write', 'produce'],
      [AIProcessStage.EXECUTING]: ['run', 'execute', 'command', 'npm', 'git']
    },
    'codex': {
      [AIProcessStage.ANALYZING]: ['analyze', 'understand', 'let me', 'I\'ll'],
      [AIProcessStage.GENERATING]: ['generate', 'create', 'write', 'implement'],
      [AIProcessStage.EXECUTING]: ['run', 'execute', 'test']
    },
    'aider': {
      [AIProcessStage.SEARCHING]: ['search', 'find', 'grep'],
      [AIProcessStage.ANALYZING]: ['analyze', 'thinking', 'let me'],
      [AIProcessStage.GENERATING]: ['edit', 'modify', 'update', 'create'],
      [AIProcessStage.EXECUTING]: ['run', 'execute', 'git', 'npm']
    }
  };

  constructor(tracker: AIProcessTracker, provider: string) {
    this.tracker = tracker;
    this.provider = provider;
    this.startTime = Date.now();
  }

  /**
   * 启动进度追踪
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // 推送开始阶段
    this.tracker.updateProgress({
      stage: AIProcessStage.STARTING,
      message: `启动 ${this.provider}...`,
      progress: 0
    });

    // 获取预估时间
    const estimated = ProviderProgressAdapter.estimatedTimes[this.provider] || {
      min: 30,
      max: 120,
      stages: [AIProcessStage.PROCESSING, AIProcessStage.GENERATING]
    };

    // 设置定时器定期推送进度
    let stageIndex = 0;
    const stages = estimated.stages;
    const estimatedTime = (estimated.min + estimated.max) / 2;
    const timePerStage = estimatedTime / stages.length;

    this.progressTimer = setInterval(() => {
      const elapsed = (Date.now() - this.startTime) / 1000;
      const progress = Math.min(Math.round((elapsed / estimatedTime) * 100), 95);

      // 根据时间切换阶段
      const currentStageIndex = Math.min(
        Math.floor(elapsed / timePerStage),
        stages.length - 1
      );

      if (currentStageIndex !== stageIndex) {
        stageIndex = currentStageIndex;
      }

      const stage = stages[stageIndex];
      const remaining = Math.max(0, Math.round(estimatedTime - elapsed));

      // 生成阶段性消息
      const messages: Record<AIProcessStage, string> = {
        [AIProcessStage.PLANNING]: '📋 规划任务...',
        [AIProcessStage.SEARCHING]: '🔍 搜索代码库...',
        [AIProcessStage.ANALYZING]: '🤔 分析思考中...',
        [AIProcessStage.READING]: '📖 读取上下文...',
        [AIProcessStage.PROCESSING]: '⚙️ 处理中...',
        [AIProcessStage.GENERATING]: '✍️ 生成回复...',
        [AIProcessStage.EXECUTING]: '🏃 执行命令...',
        [AIProcessStage.REVIEWING]: '👀 审核结果...',
        [AIProcessStage.SENDING]: '📤 发送中...',
        [AIProcessStage.CHUNKING]: '📄 分段处理...',
        [AIProcessStage.STARTING]: '🚀 启动中...',
        [AIProcessStage.CONNECTING]: '🔗 连接中...',
        [AIProcessStage.QUEUED]: '⏳ 排队中...',
        [AIProcessStage.COMPLETE]: '✅ 完成',
        [AIProcessStage.PARTIAL]: '⚠️ 部分完成',
        [AIProcessStage.CANCELLED]: '🚫 已取消',
        [AIProcessStage.TIMEOUT]: '⏰ 超时',
        [AIProcessStage.ERROR]: '❌ 错误'
      };

      this.tracker.updateProgress({
        stage,
        message: messages[stage] || '处理中...',
        progress,
        elapsedTime: Math.round(elapsed),
        estimatedTimeRemaining: remaining,
        metadata: {
          estimatedTime: `${estimated.min}-${estimated.max}秒`,
          provider: this.provider
        }
      });

      // 推送部分结果预览
      if (this.outputBuffer.length > this.lastOutputLength + 500) {
        this.lastOutputLength = this.outputBuffer.length;
        this.tracker.updateProgress({
          stage,
          message: messages[stage] || '处理中...',
          progress,
          partialResult: this.outputBuffer.slice(-1000),
          elapsedTime: Math.round(elapsed),
          estimatedTimeRemaining: remaining
        });
      }
    }, 15000); // 每15秒推送一次
  }

  /**
   * 处理输出内容，推断阶段
   */
  processOutput(data: string): void {
    this.outputBuffer += data;

    // 基于关键字推断阶段
    const keywords = ProviderProgressAdapter.stageKeywords[this.provider];
    if (keywords) {
      const lowerData = data.toLowerCase();
      for (const [stage, words] of Object.entries(keywords)) {
        if (words.some(word => lowerData.includes(word.toLowerCase()))) {
          const elapsed = (Date.now() - this.startTime) / 1000;
          this.tracker.updateProgress({
            stage: stage as AIProcessStage,
            message: `检测到 ${stage} 阶段...`,
            partialResult: this.outputBuffer.slice(-500),
            elapsedTime: Math.round(elapsed)
          });
          break;
        }
      }
    }
  }

  /**
   * 停止进度追踪
   */
  stop(result?: string): void {
    this.isRunning = false;
    
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }

    if (result) {
      this.tracker.complete(result);
    }
  }

  /**
   * 错误处理
   */
  error(errorMessage: string): void {
    this.isRunning = false;
    
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }

    this.tracker.error(errorMessage, this.outputBuffer);
  }

  /**
   * 超时处理
   */
  timeout(): void {
    this.isRunning = false;
    
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }

    this.tracker.timeout();
  }
}

/**
 * 为 Provider 的 processMessage 包装进度追踪
 */
export function wrapProviderWithProgress(
  providerName: string,
  processMessageFn: (text: string, history?: unknown[], options?: ProcessOptions) => Promise<string | null>,
  tracker: AIProcessTracker
): (text: string, history?: unknown[], options?: ProcessOptions) => Promise<string | null> {
  return async (text: string, history?: unknown[], options?: ProcessOptions): Promise<string | null> => {
    const adapter = new ProviderProgressAdapter(tracker, providerName);
    
    // 包装 onProgress 回调
    const originalOnProgress = options?.onProgress;
    const wrappedOptions: ProcessOptions = {
      ...options,
      onProgress: (update) => {
        // 调用原始回调
        originalOnProgress?.(update);
        
        // 更新 tracker
        tracker.updateProgress({
          stage: update.stage as AIProcessStage,
          message: update.message,
          progress: update.progress,
          partialResult: update.partialResult
        });
      }
    };

    adapter.start();

    try {
      const result = await processMessageFn(text, history, wrappedOptions);
      adapter.stop(result || undefined);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      adapter.error(errorMessage);
      throw error;
    }
  };
}
