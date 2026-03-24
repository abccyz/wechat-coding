import { spawn } from 'node:child_process';
import { CLIProvider, Message, Agent, TestResult, ProcessOptions, ProgressUpdate } from './base.ts';

export class CodexProvider extends CLIProvider {
  getName(): string {
    return 'OpenAI Codex';
  }

  getDescription(): string {
    return 'OpenAI Codex - OpenAI 官方代码生成助手';
  }

  getInstallCommand(): string {
    return 'npm install -g @openai/codex';
  }

  /**
   * 检测消息类型
   */
  private detectMessageType(text: string): { type: string; estimatedTime: string } {
    const lower = text.toLowerCase();
    
    if (lower.includes('explain') || lower.includes('解释') || lower.includes('说明')) {
      return { type: 'explain', estimatedTime: '15-30秒' };
    }
    if (lower.includes('refactor') || lower.includes('重构') || lower.includes('优化')) {
      return { type: 'refactor', estimatedTime: '20-60秒' };
    }
    if (lower.includes('fix') || lower.includes('修复') || lower.includes('debug')) {
      return { type: 'fix', estimatedTime: '20-50秒' };
    }
    if (lower.includes('implement') || lower.includes('实现') || lower.includes('create')) {
      return { type: 'implement', estimatedTime: '30-120秒' };
    }
    if (lower.includes('review') || lower.includes('审核') || lower.includes('检查')) {
      return { type: 'review', estimatedTime: '40-80秒' };
    }
    
    return { type: 'general', estimatedTime: '15-45秒' };
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
      
      args.push(text);

      console.log(`[Codex] Running: codex ${args.join(' ')}`);
      console.log(`[Codex] Detected type: ${messageType.type}, estimated: ${messageType.estimatedTime}`);

      // 通知开始
      if (onProgress) {
        onProgress({
          stage: 'starting',
          message: `⏳ 开始处理 [${messageType.type}]，预计耗时 ${messageType.estimatedTime}...`,
          progress: 0
        });
      }

      const codex = spawn('codex', args, {
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
          const elapsed = Math.round((Date.now() - lastProgressTime) / 1000);
          
          // 每15秒推送一次进度更新
          if (elapsed > 15) {
            progressCount++;
            
            onProgress({
              stage: 'processing',
              message: `⚙️ 正在生成代码... (${progressCount * 15}秒)`,
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

      codex.stdout.on('data', (data) => {
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

      codex.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      const timeout = setTimeout(() => {
        clearInterval(progressTimer);
        codex.kill('SIGTERM');
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
          reject(new Error('Codex timeout'));
        }
      }, this.config.timeout);

      codex.on('close', (code) => {
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
          reject(new Error(`Codex exited with code ${code}: ${errorOutput || 'Unknown error'}`));
        }
      });

      codex.on('error', (err) => {
        clearTimeout(timeout);
        clearInterval(progressTimer);
        if (onProgress) {
          onProgress({
            stage: 'error',
            message: `❌ 启动失败: ${err.message}`
          });
        }
        if (err.message.includes('ENOENT')) {
          reject(new Error('Codex CLI not found. Run: npm install -g @openai/codex'));
        } else {
          reject(err);
        }
      });
    });
  }

  async listAgents(): Promise<Agent[]> {
    return [
      { id: 'gpt-4o', name: 'GPT-4o', description: '最强大的多模态模型，适合复杂任务' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '快速且经济的模型，适合简单任务' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: '高性能模型，适合代码生成' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: '快速响应模型，适合日常问答' }
    ];
  }

  async testConnection(): Promise<TestResult> {
    return new Promise((resolve) => {
      const codex = spawn('codex', ['--version'], {
        timeout: 10000,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';

      codex.stdout.on('data', (data) => {
        output += data.toString();
      });

      codex.on('close', (code) => {
        if (code === 0) {
          resolve({ 
            success: true, 
            message: `Codex CLI 连接成功 (${output.trim()})` 
          });
        } else {
          resolve({ 
            success: false, 
            message: 'Codex CLI 测试失败' 
          });
        }
      });

      codex.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          resolve({ 
            success: false, 
            message: 'Codex CLI 未找到，请先安装: npm install -g @openai/codex' 
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
