import { EventEmitter } from 'events';

/**
 * AI 处理阶段 - 统一标准
 */
export enum AIProcessStage {
  // 准备阶段
  QUEUED = 'queued',           // 已入队等待
  STARTING = 'starting',       // 开始启动
  CONNECTING = 'connecting',   // 连接 AI 服务

  // 分析阶段
  PLANNING = 'planning',       // 任务规划
  SEARCHING = 'searching',     // 搜索代码/文件
  ANALYZING = 'analyzing',     // 分析思考
  READING = 'reading',         // 读取上下文

  // 执行阶段
  PROCESSING = 'processing',   // 处理中
  GENERATING = 'generating',   // 生成内容
  EXECUTING = 'executing',     // 执行命令
  REVIEWING = 'reviewing',     // 审核结果

  // 发送阶段
  SENDING = 'sending',         // 发送回复
  CHUNKING = 'chunking',       // 分段处理

  // 结束阶段
  COMPLETE = 'complete',       // 完成
  PARTIAL = 'partial',         // 部分完成（有错误但返回了结果）
  CANCELLED = 'cancelled',     // 已取消
  TIMEOUT = 'timeout',         // 超时
  ERROR = 'error'              // 错误
}

/**
 * 子任务信息
 */
export interface SubTask {
  id: string;
  name: string;
  stage: AIProcessStage;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  result?: string;
}

/**
 * AI 进度更新 - 增强版
 */
export interface AIProcessUpdate {
  stage: AIProcessStage;
  message: string;
  detail?: string;                    // 详细说明
  progress?: number;                  // 0-100
  subTasks?: SubTask[];               // 子任务列表
  partialResult?: string;             // 部分结果预览
  estimatedTimeRemaining?: number;    // 预估剩余时间（秒）
  elapsedTime?: number;               // 已耗时（秒）
  metadata?: Record<string, unknown>; // 元数据
}

/**
 * 推送策略配置
 */
export interface PushStrategy {
  // 是否启用该阶段的推送
  enabled: boolean;
  // 最小推送间隔（秒），防止刷屏
  minInterval: number;
  // 是否推送到微信
  pushToWechat: boolean;
  // 是否广播到 Web
  broadcastToWeb: boolean;
  // 消息模板
  template: string;
  // 优先级（1-10，数字越大越优先）
  priority: number;
}

/**
 * 默认推送策略
 */
export const DefaultPushStrategies: Record<AIProcessStage, PushStrategy> = {
  [AIProcessStage.QUEUED]: {
    enabled: true,
    minInterval: 0,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '⏳ 已加入队列，前面还有 {queuePosition} 个任务',
    priority: 3
  },
  [AIProcessStage.STARTING]: {
    enabled: true,
    minInterval: 0,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '🚀 开始处理，预计耗时 {estimatedTime}',
    priority: 5
  },
  [AIProcessStage.CONNECTING]: {
    enabled: false,
    minInterval: 5,
    pushToWechat: false,
    broadcastToWeb: true,
    template: '🔗 连接 {provider}...',
    priority: 2
  },
  [AIProcessStage.PLANNING]: {
    enabled: true,
    minInterval: 10,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '📋 规划任务... ({elapsed}s)',
    priority: 4
  },
  [AIProcessStage.SEARCHING]: {
    enabled: true,
    minInterval: 15,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '🔍 搜索代码库... 已找到 {filesFound} 个文件 ({elapsed}s)',
    priority: 4
  },
  [AIProcessStage.ANALYZING]: {
    enabled: true,
    minInterval: 20,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '🤔 分析思考中... ({elapsed}s)',
    priority: 4
  },
  [AIProcessStage.READING]: {
    enabled: false,
    minInterval: 10,
    pushToWechat: false,
    broadcastToWeb: true,
    template: '📖 读取上下文...',
    priority: 2
  },
  [AIProcessStage.PROCESSING]: {
    enabled: true,
    minInterval: 30,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '⚙️ 处理中... {progress}% ({elapsed}s)',
    priority: 3
  },
  [AIProcessStage.GENERATING]: {
    enabled: true,
    minInterval: 20,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '✍️ 生成回复... 已输出 {outputLength} 字符 ({elapsed}s)',
    priority: 4
  },
  [AIProcessStage.EXECUTING]: {
    enabled: true,
    minInterval: 10,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '🏃 执行中: {command} ({elapsed}s)',
    priority: 5
  },
  [AIProcessStage.REVIEWING]: {
    enabled: true,
    minInterval: 15,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '👀 审核结果... ({elapsed}s)',
    priority: 4
  },
  [AIProcessStage.SENDING]: {
    enabled: true,
    minInterval: 5,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '📤 发送回复... ({chunkInfo})',
    priority: 6
  },
  [AIProcessStage.CHUNKING]: {
    enabled: false,
    minInterval: 3,
    pushToWechat: false,
    broadcastToWeb: true,
    template: '📄 分段处理...',
    priority: 3
  },
  [AIProcessStage.COMPLETE]: {
    enabled: true,
    minInterval: 0,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '✅ 处理完成！总耗时 {totalTime}',
    priority: 10
  },
  [AIProcessStage.PARTIAL]: {
    enabled: true,
    minInterval: 0,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '⚠️ 部分完成: {reason}',
    priority: 8
  },
  [AIProcessStage.CANCELLED]: {
    enabled: true,
    minInterval: 0,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '🚫 已取消',
    priority: 8
  },
  [AIProcessStage.TIMEOUT]: {
    enabled: true,
    minInterval: 0,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '⏰ 处理超时，已返回部分结果',
    priority: 9
  },
  [AIProcessStage.ERROR]: {
    enabled: true,
    minInterval: 0,
    pushToWechat: true,
    broadcastToWeb: true,
    template: '❌ 处理失败: {error}',
    priority: 10
  }
};

/**
 * AI 过程追踪器 - 智能感知工作过程并推送到微信
 * 
 * 功能：
 * 1. 统一进度阶段管理
 * 2. 智能推送策略（防刷屏、优先级）
 * 3. 子任务跟踪
 * 4. 中间结果预览
 * 5. 时间预估
 */
export class AIProcessTracker extends EventEmitter {
  private taskId: string;
  private userId: string;
  private startTime: Date;
  private currentStage: AIProcessStage = AIProcessStage.STARTING;
  private lastPushTime: Map<AIProcessStage, number> = new Map();
  private subTasks: Map<string, SubTask> = new Map();
  private partialResult: string = '';
  private pushStrategies: Record<AIProcessStage, PushStrategy>;
  private metadata: Map<string, unknown> = new Map();

  constructor(
    taskId: string,
    userId: string,
    strategies: Partial<Record<AIProcessStage, Partial<PushStrategy>>> = {}
  ) {
    super();
    this.taskId = taskId;
    this.userId = userId;
    this.startTime = new Date();
    
    // 合并默认策略和自定义策略
    this.pushStrategies = { ...DefaultPushStrategies };
    for (const [stage, strategy] of Object.entries(strategies)) {
      if (strategy && this.pushStrategies[stage as AIProcessStage]) {
        this.pushStrategies[stage as AIProcessStage] = {
          ...this.pushStrategies[stage as AIProcessStage],
          ...strategy
        };
      }
    }
  }

  /**
   * 更新进度
   */
  updateProgress(update: AIProcessUpdate): void {
    const now = Date.now();
    const elapsed = Math.floor((now - this.startTime.getTime()) / 1000);
    
    // 更新状态
    this.currentStage = update.stage;
    
    // 更新部分结果
    if (update.partialResult) {
      this.partialResult = update.partialResult;
    }
    
    // 更新元数据
    if (update.metadata) {
      for (const [key, value] of Object.entries(update.metadata)) {
        this.metadata.set(key, value);
      }
    }
    
    // 检查是否应该推送
    const strategy = this.pushStrategies[update.stage];
    if (!strategy || !strategy.enabled) {
      this.emit('update', { ...update, shouldPush: false, userId: this.userId });
      return;
    }

    // 检查推送间隔
    const lastPush = this.lastPushTime.get(update.stage) || 0;
    const shouldPush = now - lastPush >= strategy.minInterval * 1000;

    if (shouldPush) {
      this.lastPushTime.set(update.stage, now);
      
      // 生成推送消息
      const message = this.formatMessage(strategy.template, {
        ...update,
        elapsed,
        elapsedFormatted: this.formatDuration(elapsed)
      });

      const pushData = {
        ...update,
        message,
        shouldPush: true,
        pushToWechat: strategy.pushToWechat,
        broadcastToWeb: strategy.broadcastToWeb,
        priority: strategy.priority,
        userId: this.userId,
        taskId: this.taskId
      };

      this.emit('update', pushData);
      this.emit('push', pushData);
    } else {
      // 只广播到 Web，不推送到微信
      this.emit('update', {
        ...update,
        shouldPush: false,
        broadcastToWeb: strategy.broadcastToWeb,
        userId: this.userId
      });
    }
  }

  /**
   * 添加子任务
   */
  addSubTask(subTask: SubTask): void {
    this.subTasks.set(subTask.id, { ...subTask, status: 'pending' });
    this.emit('subTaskAdded', subTask);
  }

  /**
   * 更新子任务状态
   */
  updateSubTask(id: string, update: Partial<SubTask>): void {
    const subTask = this.subTasks.get(id);
    if (subTask) {
      Object.assign(subTask, update);
      if (update.status === 'running' && !subTask.startTime) {
        subTask.startTime = new Date();
      }
      if ((update.status === 'completed' || update.status === 'failed') && !subTask.endTime) {
        subTask.endTime = new Date();
      }
      this.emit('subTaskUpdated', subTask);
    }
  }

  /**
   * 完成处理
   */
  complete(result?: string): void {
    const totalTime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    
    this.updateProgress({
      stage: AIProcessStage.COMPLETE,
      message: '处理完成',
      progress: 100,
      elapsedTime: totalTime,
      partialResult: result || this.partialResult
    });

    this.emit('completed', {
      taskId: this.taskId,
      userId: this.userId,
      totalTime,
      result: result || this.partialResult,
      subTasks: Array.from(this.subTasks.values())
    });
  }

  /**
   * 错误处理
   */
  error(errorMessage: string, partialResult?: string): void {
    this.updateProgress({
      stage: AIProcessStage.ERROR,
      message: `处理失败: ${errorMessage}`,
      detail: errorMessage,
      partialResult: partialResult || this.partialResult
    });

    this.emit('error', {
      taskId: this.taskId,
      userId: this.userId,
      error: errorMessage,
      partialResult: partialResult || this.partialResult
    });
  }

  /**
   * 超时处理
   */
  timeout(): void {
    const elapsed = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    
    this.updateProgress({
      stage: AIProcessStage.TIMEOUT,
      message: '处理超时，返回部分结果',
      elapsedTime: elapsed,
      partialResult: this.partialResult
    });

    this.emit('timeout', {
      taskId: this.taskId,
      userId: this.userId,
      elapsed,
      partialResult: this.partialResult
    });
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      taskId: this.taskId,
      userId: this.userId,
      currentStage: this.currentStage,
      startTime: this.startTime,
      elapsedTime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
      subTasks: Array.from(this.subTasks.values()),
      partialResult: this.partialResult
    };
  }

  /**
   * 获取部分结果预览（用于微信推送）
   */
  getPartialResultPreview(maxLength: number = 500): string {
    if (!this.partialResult) return '';
    if (this.partialResult.length <= maxLength) return this.partialResult;
    return this.partialResult.slice(0, maxLength) + '...';
  }

  /**
   * 格式化消息模板
   */
  private formatMessage(
    template: string,
    data: AIProcessUpdate & { elapsed: number; elapsedFormatted: string }
  ): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      const value = this.getValueByKey(data, key);
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * 根据 key 获取值（支持嵌套）
   */
  private getValueByKey(data: AIProcessUpdate & { elapsed: number; elapsedFormatted: string }, key: string): unknown {
    // 直接值
    if (key in data) return data[key];
    
    // 元数据
    if (this.metadata.has(key)) return this.metadata.get(key);
    
    // 特殊处理
    switch (key) {
      case 'totalTime':
      case 'elapsedFormatted':
        return this.formatDuration(data.elapsed as number);
      case 'outputLength':
        return this.partialResult.length;
      case 'queuePosition':
        return this.metadata.get('queuePosition') || 0;
      case 'filesFound':
        return this.metadata.get('filesFound') || 0;
      case 'provider':
        return this.metadata.get('provider') || 'AI';
      case 'estimatedTime':
        return this.metadata.get('estimatedTime') || '未知';
      case 'chunkInfo':
        return this.metadata.get('chunkInfo') || '';
      case 'command':
        return this.metadata.get('command') || '';
      case 'error':
        return data.detail || '未知错误';
      case 'reason':
        return data.detail || '';
      default:
        return undefined;
    }
  }

  /**
   * 格式化时长
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
  }
}

/**
 * AI 过程追踪器管理器 - 管理多个任务
 */
export class AIProcessTrackerManager {
  private trackers: Map<string, AIProcessTracker> = new Map();
  private userTasks: Map<string, string[]> = new Map(); // userId -> taskIds

  /**
   * 创建追踪器
   */
  createTracker(
    taskId: string,
    userId: string,
    strategies?: Partial<Record<AIProcessStage, Partial<PushStrategy>>>
  ): AIProcessTracker {
    const tracker = new AIProcessTracker(taskId, userId, strategies);
    this.trackers.set(taskId, tracker);
    
    // 记录用户的任务
    const userTaskList = this.userTasks.get(userId) || [];
    userTaskList.push(taskId);
    this.userTasks.set(userId, userTaskList);
    
    return tracker;
  }

  /**
   * 获取追踪器
   */
  getTracker(taskId: string): AIProcessTracker | undefined {
    return this.trackers.get(taskId);
  }

  /**
   * 获取用户的所有任务
   */
  getUserTasks(userId: string): AIProcessTracker[] {
    const taskIds = this.userTasks.get(userId) || [];
    return taskIds
      .map(id => this.trackers.get(id))
      .filter((t): t is AIProcessTracker => t !== undefined);
  }

  /**
   * 获取用户正在进行的任务数
   */
  getUserPendingCount(userId: string): number {
    return this.getUserTasks(userId).filter(
      t => t.getStatus().currentStage !== AIProcessStage.COMPLETE &&
           t.getStatus().currentStage !== AIProcessStage.ERROR &&
           t.getStatus().currentStage !== AIProcessStage.CANCELLED
    ).length;
  }

  /**
   * 移除追踪器
   */
  removeTracker(taskId: string): void {
    const tracker = this.trackers.get(taskId);
    if (tracker) {
      const userId = tracker.getStatus().userId;
      const userTaskList = this.userTasks.get(userId) || [];
      const index = userTaskList.indexOf(taskId);
      if (index > -1) {
        userTaskList.splice(index, 1);
      }
      this.trackers.delete(taskId);
    }
  }

  /**
   * 清理已完成的任务
   */
  cleanupCompleted(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [taskId, tracker] of this.trackers) {
      const status = tracker.getStatus();
      const isCompleted = [
        AIProcessStage.COMPLETE,
        AIProcessStage.ERROR,
        AIProcessStage.CANCELLED,
        AIProcessStage.TIMEOUT
      ].includes(status.currentStage);
      
      if (isCompleted && now - status.startTime.getTime() > maxAge) {
        this.removeTracker(taskId);
      }
    }
  }
}

// 导出单例
export const aiProcessTrackerManager = new AIProcessTrackerManager();
