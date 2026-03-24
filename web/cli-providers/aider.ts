import { spawn } from 'node:child_process';
import { CLIProvider, Message, Agent, TestResult, ProcessOptions, ProgressUpdate, getWorkingDirectory } from './base.ts';

export class AiderProvider extends CLIProvider {
  getName(): string {
    return 'Aider';
  }

  getDescription(): string {
    return 'Aider - 支持多模型（GPT-4、Claude 等）的 AI 编程助手';
  }

  getInstallCommand(): string {
    return 'pip install aider-chat';
  }

  /**
   * 检测消息类型
   */
  private detectMessageType(text: string): { type: string; estimatedTime: string } {
    const lower = text.toLowerCase();
    
    if (lower.includes('add') || lower.includes('添加') || lower.includes('include')) {
      return { type: 'add_file', estimatedTime: '10-20秒' };
    }
    if (lower.includes('drop') || lower.includes('移除') || lower.includes('remove')) {
      return { type: 'drop_file', estimatedTime: '10-20秒' };
    }
    if (lower.includes('/undo') || lower.includes('撤销')) {
      return { type: 'undo', estimatedTime: '5-10秒' };
    }
    if (lower.includes('/diff') || lower.includes('diff') || lower.includes('差异')) {
      return { type: 'diff', estimatedTime: '15-30秒' };
    }
    if (lower.includes('/commit') || lower.includes('commit') || lower.includes('提交')) {
      return { type: 'commit', estimatedTime: '20-40秒' };
    }
    if (lower.includes('/lint') || lower.includes('lint') || lower.includes('检查')) {
      return { type: 'lint', estimatedTime: '30-60秒' };
    }
    
    return { type: 'general', estimatedTime: '30-120秒' };
  }

  async processMessage(text: string, history?: Message[], options?: ProcessOptions): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const { onProgress, onPartialResult } = options || {};
    const messageType = this.detectMessageType(text);

    return new Promise((resolve, reject) => {
      const args = ['--message', text];
      
      // 支持指定模型
      if (this.config.model) {
        args.push('--model', this.config.model);
      }
      
      // 非交互模式
      args.push('--no-git', '--no-auto-commit');
      
      if (this.config.extraArgs) {
        args.push(...this.config.extraArgs);
      }

      console.log(`[Aider] Running: aider ${args.join(' ')}`);
      console.log(`[Aider] Detected type: ${messageType.type}, estimated: ${messageType.estimatedTime}`);

      // 通知开始
      if (onProgress) {
        onProgress({
          stage: 'starting',
          message: `⏳ 开始处理 [${messageType.type}]，预计耗时 ${messageType.estimatedTime}...`,
          progress: 0
        });
      }

      const aider = spawn('aider', args, {
        timeout: this.config.timeout,
        cwd: getWorkingDirectory(),
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
          
          // 每20秒推送一次进度更新（Aider 通常较慢）
          if (elapsed > 20) {
            progressCount++;
            
            onProgress({
              stage: 'processing',
              message: `⚙️ 正在处理... (${progressCount * 20}秒)`,
              partialResult: currentText.slice(-500),
              progress: Math.min(progressCount * 8, 90)
            });
            
            // 推送部分结果
            if (onPartialResult && currentText.length > 100) {
              onPartialResult(currentText.slice(-1000));
            }
          }
        }
      }, 5000);

      aider.stdout.on('data', (data) => {
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

      aider.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      const timeout = setTimeout(() => {
        clearInterval(progressTimer);
        aider.kill('SIGTERM');
        if (textParts.length > 0) {
          const result = textParts.join('');
          // 清理输出
          const cleanOutput = result
            .replace(/\x1b\[[0-9;]*m/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          if (onProgress) {
            onProgress({
              stage: 'complete',
              message: '✅ 处理完成（超时返回部分结果）',
              progress: 100
            });
          }
          resolve(cleanOutput || '处理完成');
        } else {
          reject(new Error('Aider timeout'));
        }
      }, this.config.timeout);

      aider.on('close', (code) => {
        clearTimeout(timeout);
        clearInterval(progressTimer);
        
        // 清理输出
        const cleanOutput = output
          .replace(/\x1b\[[0-9;]*m/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        
        if (code === 0 || code === null) {
          if (onProgress) {
            onProgress({
              stage: 'complete',
              message: '✅ 处理完成',
              progress: 100
            });
          }
          resolve(cleanOutput || '处理完成');
        } else {
          if (onProgress) {
            onProgress({
              stage: 'error',
              message: `❌ 处理失败: ${errorOutput || 'Unknown error'}`
            });
          }
          reject(new Error(`Aider exited with code ${code}: ${errorOutput || output}`));
        }
      });

      aider.on('error', (err) => {
        clearTimeout(timeout);
        clearInterval(progressTimer);
        if (onProgress) {
          onProgress({
            stage: 'error',
            message: `❌ 启动失败: ${err.message}`
          });
        }
        if (err.message.includes('ENOENT')) {
          reject(new Error('Aider not found. Run: pip install aider-chat'));
        } else {
          reject(err);
        }
      });
    });
  }

  async listAgents(): Promise<Agent[]> {
    return [
      { id: 'gpt-4', name: 'GPT-4', description: 'OpenAI GPT-4 模型' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'OpenAI GPT-4o 多模态模型' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'OpenAI GPT-4o Mini 快速模型' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Anthropic Claude 3 Opus' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: 'Anthropic Claude 3 Sonnet' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Anthropic Claude 3 Haiku' }
    ];
  }

  async testConnection(): Promise<TestResult> {
    return new Promise((resolve) => {
      const aider = spawn('aider', ['--version'], {
        timeout: 10000,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';

      aider.stdout.on('data', (data) => {
        output += data.toString();
      });

      aider.on('close', (code) => {
        if (code === 0) {
          resolve({ 
            success: true, 
            message: `Aider 连接成功 (${output.trim()})` 
          });
        } else {
          resolve({ 
            success: false, 
            message: 'Aider 测试失败' 
          });
        }
      });

      aider.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          resolve({ 
            success: false, 
            message: 'Aider 未找到，请先安装: pip install aider-chat' 
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
