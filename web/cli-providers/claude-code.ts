import { spawn } from 'node:child_process';
import { CLIProvider, Message, Agent, TestResult, ProcessOptions, ProgressUpdate } from './base.ts';

export class ClaudeCodeProvider extends CLIProvider {
  getName(): string {
    return 'Claude Code';
  }

  getDescription(): string {
    return 'Claude Code - Anthropic Claude 官方 CLI';
  }

  getInstallCommand(): string {
    return 'npm install -g @anthropic-ai/claude-code';
  }

  /**
   * 检测消息类型
   */
  private detectMessageType(text: string): { type: string; estimatedTime: string } {
    const lower = text.toLowerCase();
    
    if (lower.includes('explain') || lower.includes('解释') || lower.includes('说明')) {
      return { type: 'explain', estimatedTime: '20-40秒' };
    }
    if (lower.includes('refactor') || lower.includes('重构') || lower.includes('优化')) {
      return { type: 'refactor', estimatedTime: '30-90秒' };
    }
    if (lower.includes('fix') || lower.includes('修复') || lower.includes('bug')) {
      return { type: 'fix', estimatedTime: '30-60秒' };
    }
    if (lower.includes('implement') || lower.includes('实现') || lower.includes('编写')) {
      return { type: 'implement', estimatedTime: '60-180秒' };
    }
    if (lower.includes('test') || lower.includes('测试')) {
      return { type: 'test', estimatedTime: '40-80秒' };
    }
    
    return { type: 'general', estimatedTime: '20-60秒' };
  }

  /**
   * 从输出内容推断阶段
   */
  private inferStage(output: string): ProgressUpdate['stage'] {
    const lower = output.toLowerCase();
    
    if (lower.includes('search') || lower.includes('find') || lower.includes('grep')) {
      return 'searching';
    }
    if (lower.includes('analyze') || lower.includes('thinking') || lower.includes('consider')) {
      return 'analyzing';
    }
    if (lower.includes('process') || lower.includes('handle')) {
      return 'processing';
    }
    if (lower.includes('generat') || lower.includes('write') || lower.includes('create')) {
      return 'processing';
    }
    
    return 'processing';
  }

  async processMessage(text: string, history?: Message[], options?: ProcessOptions): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const { onProgress, onPartialResult } = options || {};
    const messageType = this.detectMessageType(text);

    return new Promise((resolve, reject) => {
      const args = [];
      
      if (this.config.model) {
        args.push('--model', this.config.model);
      }
      
      if (this.config.extraArgs) {
        args.push(...this.config.extraArgs);
      }
      
      // Claude Code 使用非交互模式
      args.push('--no-interactive');
      args.push(text);

      console.log(`[ClaudeCode] Running: claude ${args.join(' ')}`);
      console.log(`[ClaudeCode] Detected type: ${messageType.type}, estimated: ${messageType.estimatedTime}`);

      // 通知开始
      if (onProgress) {
        onProgress({
          stage: 'starting',
          message: `⏳ 开始处理 [${messageType.type}]，预计耗时 ${messageType.estimatedTime}...`,
          progress: 0
        });
      }

      const claude = spawn('claude', args, {
        timeout: this.config.timeout,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
      });

      let output = '';
      let errorOutput = '';
      const textParts: string[] = [];
      let lastProgressTime = Date.now();
      let progressCount = 0;
      
      // 阶段性推送定时器
      const progressTimer = setInterval(() => {
        if (onProgress && textParts.length > 0) {
          const currentText = textParts.join('');
          const stage = this.inferStage(currentText);
          const elapsed = Math.round((Date.now() - lastProgressTime) / 1000);
          
          // 每15秒推送一次进度更新
          if (elapsed > 15) {
            progressCount++;
            const messages: Record<string, string> = {
              starting: '⏳ 正在启动...',
              searching: `🔍 正在搜索代码库... (${progressCount * 15}秒)`,
              analyzing: `🤔 正在分析... (${progressCount * 15}秒)`,
              processing: `⚙️ 正在处理... (${progressCount * 15}秒)`,
              complete: '✅ 处理完成',
              error: '❌ 处理出错'
            };
            
            onProgress({
              stage,
              message: messages[stage] || `⏳ 处理中... (${progressCount * 15}秒)`,
              partialResult: currentText.slice(-500),
              progress: Math.min(progressCount * 10, 90)
            });
            
            // 推送部分结果
            if (onPartialResult && currentText.length > 100) {
              onPartialResult(currentText.slice(-1000));
            }
          }
        }
      }, 5000);

      claude.stdout.on('data', (data) => {
        const str = data.toString();
        output += str;
        textParts.push(str);
        
        // 实时推送部分结果
        if (onPartialResult) {
          const currentText = textParts.join('');
          // 每累积500字符推送一次
          if (currentText.length % 500 < 100) {
            onPartialResult(currentText.slice(-1000));
          }
        }
      });

      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      const timeout = setTimeout(() => {
        clearInterval(progressTimer);
        claude.kill('SIGTERM');
        if (textParts.length > 0) {
          const result = textParts.join('');
          if (onProgress) {
            onProgress({
              stage: 'complete',
              message: '✅ 处理完成（超时返回部分结果）',
              progress: 100
            });
          }
          resolve(result);
        } else {
          reject(new Error('Claude Code timeout'));
        }
      }, this.config.timeout);

      claude.on('close', (code) => {
        clearTimeout(timeout);
        clearInterval(progressTimer);
        
        if (textParts.length > 0) {
          const result = textParts.join('');
          if (onProgress) {
            onProgress({
              stage: 'complete',
              message: '✅ 处理完成',
              progress: 100
            });
          }
          resolve(result);
        } else if (code === 0) {
          if (onProgress) {
            onProgress({
              stage: 'complete',
              message: '✅ 处理完成',
              progress: 100
            });
          }
          resolve(output.trim());
        } else {
          if (onProgress) {
            onProgress({
              stage: 'error',
              message: `❌ 处理失败: ${errorOutput || 'Unknown error'}`
            });
          }
          reject(new Error(`Claude Code exited with code ${code}: ${errorOutput || 'Unknown error'}`));
        }
      });

      claude.on('error', (err) => {
        clearTimeout(timeout);
        clearInterval(progressTimer);
        if (onProgress) {
          onProgress({
            stage: 'error',
            message: `❌ 启动失败: ${err.message}`
          });
        }
        if (err.message.includes('ENOENT')) {
          reject(new Error('Claude Code CLI not found. Run: npm install -g @anthropic-ai/claude-code'));
        } else {
          reject(err);
        }
      });
    });
  }

  async listAgents(): Promise<Agent[]> {
    return [
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: '最强大的 Claude 模型，适合复杂任务' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: '平衡性能和速度' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: '最快的响应，适合简单任务' }
    ];
  }

  async testConnection(): Promise<TestResult> {
    return new Promise((resolve) => {
      const claude = spawn('claude', ['--version'], {
        timeout: 10000,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';

      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.on('close', (code) => {
        if (code === 0) {
          resolve({ 
            success: true, 
            message: `Claude Code CLI 连接成功 (${output.trim()})` 
          });
        } else {
          resolve({ 
            success: false, 
            message: 'Claude Code CLI 测试失败' 
          });
        }
      });

      claude.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          resolve({ 
            success: false, 
            message: 'Claude Code CLI 未找到，请先安装: npm install -g @anthropic-ai/claude-code' 
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
