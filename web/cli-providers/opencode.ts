import { spawn } from 'node:child_process';
import { CLIProvider, Message, Agent, TestResult, ProcessOptions, ProgressUpdate, getWorkingDirectory } from './base.ts';

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

  /**
   * 检测消息类型，用于决定推送策略
   */
  private detectMessageType(text: string): { type: string; estimatedTime: string } {
    const lower = text.toLowerCase();
    
    if (lower.includes('explore') || lower.includes('搜索') || lower.includes('查找')) {
      return { type: 'explore', estimatedTime: '30-60秒' };
    }
    if (lower.includes('plan') || lower.includes('规划') || lower.includes('设计')) {
      return { type: 'plan', estimatedTime: '1-3分钟' };
    }
    if (lower.includes('build') || lower.includes('构建') || lower.includes('编译')) {
      return { type: 'build', estimatedTime: '10-30秒' };
    }
    if (lower.includes('analyze') || lower.includes('分析') || lower.includes('code review')) {
      return { type: 'analyze', estimatedTime: '1-2分钟' };
    }
    if (lower.includes('oracle') || lower.includes('架构')) {
      return { type: 'oracle', estimatedTime: '2-5分钟' };
    }
    
    return { type: 'general', estimatedTime: '10-30秒' };
  }

  /**
   * 从输出内容推断当前阶段
   */
  private inferStage(output: string): ProgressUpdate['stage'] {
    const lower = output.toLowerCase();
    
    if (lower.includes('search') || lower.includes('explore') || lower.includes('grep') || lower.includes('finding')) {
      return 'searching';
    }
    if (lower.includes('analyze') || lower.includes('analyzing') || lower.includes('思考') || lower.includes('thinking')) {
      return 'analyzing';
    }
    if (lower.includes('process') || lower.includes('executing') || lower.includes('running')) {
      return 'processing';
    }
    if (lower.includes('complete') || lower.includes('done') || lower.includes('finished')) {
      return 'complete';
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
      const args = ['run', '--format', 'json'];
      
      if (this.config.model) {
        args.push('--agent', this.config.model);
      }
      
      if (this.config.extraArgs) {
        args.push(...this.config.extraArgs);
      }

      console.log(`[OpenCode] Running: opencode ${args.join(' ')}`);
      console.log(`[OpenCode] Input: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      console.log(`[OpenCode] Detected type: ${messageType.type}, estimated: ${messageType.estimatedTime}`);

      // 通知开始
      if (onProgress) {
        onProgress({
          stage: 'starting',
          message: `⏳ 开始处理 [${messageType.type}]，预计耗时 ${messageType.estimatedTime}...`,
          progress: 0
        });
      }

      const cwd = getWorkingDirectory();
      console.log(`[OpenCode] Working directory: ${cwd}`);

      const opencode = spawn('opencode', args, {
        timeout: this.config.timeout,
        cwd: cwd,
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
            const messages: Record<ProgressUpdate['stage'], string> = {
              starting: '⏳ 正在启动...',
              searching: `🔍 正在搜索代码库... (${progressCount * 15}秒)`,
              analyzing: `📊 正在分析... (${progressCount * 15}秒)`,
              processing: `⚙️ 正在处理... (${progressCount * 15}秒)`,
              complete: '✅ 处理完成',
              error: '❌ 处理出错'
            };
            
            onProgress({
              stage,
              message: messages[stage] || `⏳ 处理中... (${progressCount * 15}秒)`,
              partialResult: currentText.slice(-500), // 最后500字符作为预览
              progress: Math.min(progressCount * 10, 90)
            });
            
            // 如果有部分内容，也推送
            if (onPartialResult && currentText.length > 100) {
              onPartialResult(currentText.slice(-1000));
            }
          }
        }
      }, 5000); // 每5秒检查一次

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
                
                // 实时推送部分结果
                if (onPartialResult) {
                  const currentText = textParts.join('');
                  // 每累积500字符推送一次
                  if (currentText.length % 500 < 100) {
                    onPartialResult(currentText.slice(-1000));
                  }
                }
              }
              
              // 检测特殊事件类型
              if (event.type === 'progress' && onProgress) {
                onProgress({
                  stage: event.stage as ProgressUpdate['stage'] || 'processing',
                  message: event.message || '处理中...',
                  progress: event.progress
                });
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
        clearInterval(progressTimer);
        opencode.kill('SIGTERM');
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
          reject(new Error('OpenCode CLI timeout'));
        }
      }, this.config.timeout);

      opencode.on('close', (code) => {
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
          reject(new Error(`OpenCode exited with code ${code}: ${errorOutput || 'Unknown error'}`));
        }
      });

      opencode.on('error', (err) => {
        clearTimeout(timeout);
        clearInterval(progressTimer);
        if (onProgress) {
          onProgress({
            stage: 'error',
            message: `❌ 启动失败: ${err.message}`
          });
        }
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
