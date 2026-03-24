import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WeixinBot } from '../src/index.js';
import { loadCredentials } from '../src/auth.js';
import QRCode from 'qrcode';
import { 
  CLIProviderFactory,
  createCLIProvider,
  getCLIProvider,
  setCLIProvider
} from './cli-providers/index.ts';
import { CLIProviderConfig, setWorkingDirectoryManager } from './cli-providers/base.ts';
import { WechatMessageOptimizer } from './message-optimizer.ts';
import { opencodeManager } from '../dist/tools/opencode-manager.js';
import { AIProcessTracker, aiProcessTrackerManager, AIProcessStage } from './ai-process-tracker.ts';
import { wrapProviderWithProgress } from './provider-progress-adapter.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

let bot: WeixinBot | null = null;
let messageOptimizer: WechatMessageOptimizer | null = null;
let wsClients: WebSocket[] = [];
let currentCredentials: { accountId: string; userId: string } | null = null;

// 设置全局工作目录管理器
setWorkingDirectoryManager(opencodeManager);

function broadcast(data: object) {
  const message = JSON.stringify(data);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

async function initBotFromStoredCredentials() {
  try {
    const stored = await loadCredentials();
    if (stored) {
      console.log('[Init] 发现已保存的凭证，正在恢复登录...');
      
      bot = new WeixinBot({
        onError: (err) => {
          broadcast({
            type: 'error',
            message: err instanceof Error ? err.message : String(err)
          });
        }
      });

      currentCredentials = {
        accountId: stored.accountId,
        userId: stored.userId
      };

      messageOptimizer = new WechatMessageOptimizer(bot);

      // 恢复消息监听
      bot.onMessage(async (msg) => {
        broadcast({
          type: 'message',
          message: {
            id: msg.raw.message_id,
            userId: msg.userId,
            text: msg.text,
            type: msg.type,
            timestamp: msg.timestamp.toISOString(),
            direction: 'incoming'
          }
        });

        // 首先检查是否是目录切换命令
        const command = opencodeManager.parseCommand(msg.text);
        if (command.type !== 'unknown') {
          try {
            const result = await opencodeManager.executeCommand(command);
            await bot!.reply(msg, result);
            broadcast({
              type: 'message',
              message: {
                userId: msg.userId,
                text: result,
                type: 'text',
                timestamp: new Date().toISOString(),
                direction: 'outgoing',
                provider: 'system'
              }
            });
            return;
          } catch (err) {
            console.error('[Command] Error:', err);
            await bot!.reply(msg, '❌ 命令执行失败');
            return;
          }
        }

        const provider = getCLIProvider();
        if (provider && provider.isEnabled() && messageOptimizer) {
          // 创建任务追踪器
          const taskId = `${msg.userId}_${Date.now()}`;
          const tracker = aiProcessTrackerManager.createTracker(taskId, msg.userId);
          
          // 监听推送事件
          let lastWechatPushTime = 0;
          const minWechatInterval = 20000; // 微信最小推送间隔20秒
          
          tracker.on('push', async (data) => {
            // 广播到 WebSocket
            broadcast({
              type: 'aiProgress',
              userId: msg.userId,
              stage: data.stage,
              message: data.message,
              progress: data.progress
            });
            
            // 推送到微信（有频率限制）
            if (data.pushToWechat) {
              const now = Date.now();
              if (now - lastWechatPushTime >= minWechatInterval || 
                  data.priority >= 8 || // 高优先级消息（error/complete）
                  data.stage === AIProcessStage.STARTING) {
                try {
                  await bot!.send(msg.userId, data.message);
                  lastWechatPushTime = now;
                } catch (err) {
                  console.error('[Tracker] Failed to push to WeChat:', err);
                }
              }
            }
          });
          
          try {
            let aiResponse = '';
            
            await messageOptimizer.sendStreamingResponse(
              msg.userId,
              msg._contextToken,
              async () => {
                aiResponse = await provider.processMessage(
                  msg.text,
                  undefined,
                  {
                    onProgress: (update) => {
                      // 同步更新 tracker
                      tracker.updateProgress({
                        stage: update.stage as AIProcessStage,
                        message: update.message,
                        progress: update.progress,
                        partialResult: update.partialResult
                      });
                    },
                    onPartialResult: (text) => {
                      tracker.updateProgress({
                        stage: AIProcessStage.GENERATING,
                        message: `已生成 ${text.length} 字符...`,
                        partialResult: text,
                        progress: 60
                      });
                    }
                  }
                );
                return aiResponse;
              },
              (progress) => {
                // 发送阶段的进度
                tracker.updateProgress({
                  stage: progress.stage as AIProcessStage,
                  message: progress.message || '发送中...',
                  progress: progress.progress
                });
              }
            );
            
            // 完成
            tracker.complete(aiResponse);
            
            if (aiResponse) {
              broadcast({
                type: 'message',
                message: {
                  userId: msg.userId,
                  text: aiResponse,
                  type: 'text',
                  timestamp: new Date().toISOString(),
                  direction: 'outgoing',
                  provider: provider.getName()
                }
              });
            }
            
            // 清理追踪器（延迟清理，保留历史记录）
            setTimeout(() => {
              aiProcessTrackerManager.removeTracker(taskId);
            }, 3600000); // 1小时后清理
            
          } catch (err) {
            console.error('[CLI Provider] Processing error:', err);
            
            const errorMessage = err instanceof Error ? err.message : '处理失败';
            tracker.error(errorMessage);
            
            broadcast({
              type: 'aiProgress',
              userId: msg.userId,
              stage: 'error',
              message: errorMessage
            });
            
            try {
              await bot!.send(msg.userId, `❌ 处理失败: ${errorMessage}`);
            } catch {}
          }
        }
      });

      bot.run().catch(err => {
        console.error('[Init] Bot run error:', err);
        broadcast({ type: 'error', message: err.message });
      });

      console.log('[Init] 已恢复登录状态:', stored.userId);
      
      // 广播登录成功消息给所有客户端
      broadcast({
        type: 'loginSuccess',
        accountId: stored.accountId,
        userId: stored.userId
      });
    } else {
      console.log('[Init] 未发现已保存的凭证');
    }
  } catch (err) {
    console.error('[Init] 恢复登录失败:', err);
  }
}

app.get('/api/status', (req, res) => {
  const provider = getCLIProvider();
  res.json({
    connected: bot !== null,
    loggedIn: bot !== null,
    aiEnabled: provider?.isEnabled() || false,
    provider: provider?.getName() || null
  });
});

app.get('/api/providers', (req, res) => {
  const providers = CLIProviderFactory.getAvailableProviders();
  res.json({ success: true, providers });
});

app.post('/api/login', async (req, res) => {
  try {
    if (bot) {
      bot.stop();
      bot = null;
      currentCredentials = null;
    }

    bot = new WeixinBot({
      onError: (err) => {
        broadcast({
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        });
      }
    });

    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    let qrUrl: string | null = null;

    process.stderr.write = ((chunk: any, ...args: any[]) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      if (str.startsWith('https://') && str.includes('qrcode=')) {
        qrUrl = str.trim();
        QRCode.toDataURL(qrUrl, { width: 300 }, (err, url) => {
          if (!err) {
            broadcast({ type: 'qrCode', qrUrl, qrImage: url });
          }
        });
      }
      return originalStderrWrite(chunk, ...args);
    }) as typeof process.stderr.write;

    const creds = await bot.login({ force: req.body.force });
    process.stderr.write = originalStderrWrite;
    
    currentCredentials = {
      accountId: creds.accountId,
      userId: creds.userId
    };

    // 初始化消息优化器
    messageOptimizer = new WechatMessageOptimizer(bot);

    broadcast({
      type: 'loginSuccess',
      accountId: creds.accountId,
      userId: creds.userId
    });

    bot.onMessage(async (msg) => {
      broadcast({
        type: 'message',
        message: {
          id: msg.raw.message_id,
          userId: msg.userId,
          text: msg.text,
          type: msg.type,
          timestamp: msg.timestamp.toISOString(),
          direction: 'incoming'
        }
      });

      // 首先检查是否是目录切换命令
      const command = opencodeManager.parseCommand(msg.text);
      if (command.type !== 'unknown') {
        try {
          const result = await opencodeManager.executeCommand(command);
          
          // 发送命令执行结果回复
          await bot.reply(msg, result);
          
          // 广播到 Web 界面
          broadcast({
            type: 'message',
            message: {
              userId: msg.userId,
              text: result,
              type: 'text',
              timestamp: new Date().toISOString(),
              direction: 'outgoing',
              provider: 'system'
            }
          });
          
          return;
        } catch (err) {
          console.error('[Command] Error:', err);
          await bot.reply(msg, '❌ 命令执行失败');
          return;
        }
      }

      const provider = getCLIProvider();
      if (provider && provider.isEnabled() && messageOptimizer) {
        try {
          // 阶段性推送状态到微信
          let lastProgressMessage = '';
          let progressCount = 0;
          
          const sendProgressToWechat = async (message: string) => {
            // 避免重复发送相同消息
            if (message !== lastProgressMessage) {
              lastProgressMessage = message;
              progressCount++;
              // 每第1、3、5次推送发送到微信，减少干扰
              if (progressCount <= 2 || progressCount % 3 === 0) {
                try {
                  await bot!.send(msg.userId, message);
                } catch (err) {
                  console.error('[Progress] Failed to send:', err);
                }
              }
            }
          };
          
          // 使用优化器发送流式回复，传入进度回调
          let aiResponse = '';
          await messageOptimizer.sendStreamingResponse(
            msg.userId,
            msg._contextToken,
            async () => {
              // 调用 provider 并传入进度回调
              aiResponse = await provider.processMessage(
                msg.text,
                undefined,
                {
                  onProgress: (update) => {
                    // 发送到 Web 界面
                    broadcast({
                      type: 'aiProgress',
                      userId: msg.userId,
                      stage: update.stage,
                      message: update.message,
                      progress: update.progress
                    });
                    
                    // 阶段性推送到微信
                    if (update.stage !== 'complete' && update.stage !== 'starting') {
                      sendProgressToWechat(update.message).catch(() => {});
                    }
                  },
                  onPartialResult: (text) => {
                    // 长任务时推送部分结果
                    if (text.length > 500 && progressCount % 5 === 0) {
                      broadcast({
                        type: 'aiProgress',
                        userId: msg.userId,
                        stage: 'processing',
                        message: `已生成 ${text.length} 字符...`,
                        progress: 50
                      });
                    }
                  }
                }
              );
              return aiResponse;
            },
            (progress) => {
              broadcast({
                type: 'aiProgress',
                userId: msg.userId,
                stage: progress.stage,
                message: progress.message,
                progress: progress.progress
              });
            }
          );
          
          // 广播到 Web 界面显示
          if (aiResponse) {
            broadcast({
              type: 'message',
              message: {
                userId: msg.userId,
                text: aiResponse,
                type: 'text',
                timestamp: new Date().toISOString(),
                direction: 'outgoing',
                provider: provider.getName()
              }
            });
          }
        } catch (err) {
          console.error('[CLI Provider] Processing error:', err);
          // 发送错误提示
          broadcast({
            type: 'aiProgress',
            userId: msg.userId,
            stage: 'error',
            message: err instanceof Error ? err.message : '处理失败'
          });
          
          // 错误也发送到微信
          try {
            await bot!.send(msg.userId, `❌ 处理失败: ${err instanceof Error ? err.message : '未知错误'}`);
          } catch {}
        }
      }
    });

    bot.run().catch(err => {
      broadcast({ type: 'error', message: err.message });
    });

    res.json({ success: true, accountId: creds.accountId, userId: creds.userId });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

app.post('/api/logout', async (req, res) => {
  if (bot) {
    bot.stop();
    bot = null;
    currentCredentials = null;
  }
  broadcast({ type: 'logout' });
  res.json({ success: true });
});

app.post('/api/send', async (req, res) => {
  if (!bot) {
    return res.status(400).json({ success: false, error: 'Bot not connected' });
  }

  try {
    const { userId, text } = req.body;
    await bot.send(userId, text);

    broadcast({
      type: 'message',
      message: {
        userId,
        text,
        type: 'text',
        timestamp: new Date().toISOString(),
        direction: 'outgoing'
      }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

app.get('/api/ai/config', (req, res) => {
  const provider = getCLIProvider();
  if (provider) {
    res.json({ success: true, config: provider.getConfig() });
  } else {
    res.json({ 
      success: true, 
      config: { 
        enabled: false, 
        provider: 'opencode',
        model: '', 
        timeout: 120000 
      } 
    });
  }
});

app.post('/api/ai/config', (req, res) => {
  try {
    const config: CLIProviderConfig = req.body;
    let provider = getCLIProvider();
    
    if (provider) {
      const currentConfig = provider.getConfig();
      if (currentConfig.provider !== config.provider) {
        provider = createCLIProvider(config);
      } else {
        provider.updateConfig(config);
      }
    } else {
      provider = createCLIProvider(config);
    }
    
    res.json({ success: true, enabled: provider.isEnabled(), provider: config.provider });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

app.get('/api/ai/agents', async (req, res) => {
  try {
    const { provider: providerId } = req.query;
    const config: CLIProviderConfig = { 
      enabled: true, 
      provider: (providerId as string) || 'opencode',
      timeout: 10000 
    };
    const provider = CLIProviderFactory.createProvider(config);
    
    if (provider.listAgents) {
      const agents = await provider.listAgents();
      res.json({ success: true, agents });
    } else {
      res.json({ success: true, agents: [] });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

app.post('/api/ai/test', async (req, res) => {
  try {
    const config: CLIProviderConfig = req.body;
    const provider = CLIProviderFactory.createProvider(config);
    const result = await provider.testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : '测试失败'
    });
  }
});

app.post('/api/opencode/switch', async (req, res) => {
  try {
    const { directory } = req.body;
    
    if (!directory) {
      return res.status(400).json({ 
        success: false, 
        error: '请提供目标目录路径' 
      });
    }

    const targetPath = require('path').resolve(directory);
    
    if (!require('fs').existsSync(targetPath)) {
      return res.status(400).json({ 
        success: false, 
        error: `目录不存在: ${targetPath}` 
      });
    }

    // 广播切换事件
    broadcast({
      type: 'opencodeSwitching',
      message: `正在切换到: ${targetPath}`
    });

    // 使用简化版逻辑
    try {
      const { execSync, spawn } = require('child_process');
      
      // 1. 结束旧进程
      try {
        execSync('pkill -f "bin/\\.opencode$" 2>/dev/null', { timeout: 5000 });
      } catch {}
      
      await new Promise(r => setTimeout(r, 500));

      // 2. 在新目录启动
      const child = spawn('opencode', [targetPath], {
        detached: true,
        stdio: 'ignore',
        cwd: targetPath,
        env: { ...process.env, OPENCODE_PID: '' }
      });
      
      child.unref();

      broadcast({
        type: 'opencodeSwitched',
        directory: targetPath
      });

      res.json({ 
        success: true, 
        message: 'OpenCode 已在新目录启动',
        directory: targetPath 
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '启动失败'
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : '切换失败'
    });
  }
});

app.get('/api/opencode/mode', (req, res) => {
  res.json({
    success: true,
    strongMode: opencodeManager.isStrongMode()
  });
});

app.post('/api/opencode/mode', (req, res) => {
  try {
    const { strongMode } = req.body;
    opencodeManager.setStrongMode(strongMode);
    res.json({
      success: true,
      strongMode: opencodeManager.isStrongMode()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : '设置失败'
    });
  }
});

wss.on('connection', (ws) => {
  wsClients.push(ws);
  
  if (bot && currentCredentials) {
    ws.send(JSON.stringify({
      type: 'loginSuccess',
      accountId: currentCredentials.accountId,
      userId: currentCredentials.userId
    }));
  }

  ws.on('close', () => {
    wsClients = wsClients.filter(client => client !== ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📱 Open the URL above in your browser to start`);
  console.log(`🤖 Multi-CLI AI integration ready`);
  console.log(`   Supported providers: OpenCode, Codex, Claude Code, Aider, Copilot, Codeium, Tabby`);
});
