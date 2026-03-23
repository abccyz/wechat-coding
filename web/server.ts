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
import { CLIProviderConfig } from './cli-providers/base.ts';
import { WechatMessageOptimizer } from './message-optimizer.ts';

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

        const provider = getCLIProvider();
        if (provider && provider.isEnabled() && messageOptimizer) {
          try {
            let aiResponse = '';
            await messageOptimizer.sendStreamingResponse(
              msg.userId,
              msg._contextToken,
              async () => {
                aiResponse = await provider.processMessage(msg.text);
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
            broadcast({
              type: 'aiProgress',
              userId: msg.userId,
              stage: 'error',
              message: err instanceof Error ? err.message : '处理失败'
            });
          }
        }
      });

      bot.run().catch(err => {
        console.error('[Init] Bot run error:', err);
        broadcast({ type: 'error', message: err.message });
      });

      console.log('[Init] 已恢复登录状态:', stored.userId);
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

      const provider = getCLIProvider();
      if (provider && provider.isEnabled() && messageOptimizer) {
        try {
          // 使用优化器发送流式回复
          let aiResponse = '';
          await messageOptimizer.sendStreamingResponse(
            msg.userId,
            msg._contextToken,
            async () => {
              aiResponse = await provider.processMessage(msg.text);
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
  console.log(`   Supported providers: OpenCode, Codex, Claude Code`);
});
