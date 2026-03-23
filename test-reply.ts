import { WeixinBot } from './src/index.js';

const bot = new WeixinBot({
  onError: (err) => {
    console.error('错误:', err);
  }
});

console.log('正在登录...');
await bot.login();

console.log('等待消息...');

let messageReceived = false;

bot.onMessage(async (msg) => {
  console.log('\n收到消息:');
  console.log('  用户ID:', msg.userId);
  console.log('  内容:', msg.text);
  console.log('  时间:', msg.timestamp);
  
  messageReceived = true;
  
  // 自动回复
  console.log('  正在回复...');
  try {
    await bot.sendTyping(msg.userId);
    await bot.reply(msg, `收到你的消息: "${msg.text}"`);
    console.log('  ✅ 回复成功');
  } catch (err) {
    console.error('  ❌ 回复失败:', err.message);
  }
});

// 10秒后检查是否收到消息
setTimeout(() => {
  if (!messageReceived) {
    console.log('\n⚠️ 10秒内未收到消息');
    console.log('请确保:');
    console.log('1. 已扫码登录');
    console.log('2. 在微信中给机器人发送了消息');
  }
}, 10000);

await bot.run();
