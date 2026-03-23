import { WeixinBot } from './src/index.js';
import { createCLIProvider, getCLIProvider } from './web/cli-providers/index.js';

console.log('=== 测试完整消息流转 ===\n');

// 1. 初始化 AI Provider
console.log('1. 初始化 AI Provider...');
const provider = createCLIProvider({
  enabled: true,
  provider: 'opencode',
  model: 'build',
  timeout: 60000
});
console.log('   ✅ Provider:', provider.getName());

// 2. 登录微信
console.log('\n2. 登录微信...');
const bot = new WeixinBot({
  onError: (err) => {
    console.error('❌ Bot 错误:', err);
  }
});

await bot.login();
console.log('   ✅ 登录成功');

// 3. 设置消息处理
console.log('\n3. 设置消息处理...');
let messageCount = 0;

bot.onMessage(async (msg) => {
  messageCount++;
  console.log(`\n📨 [${messageCount}] 收到微信消息:`);
  console.log('   用户:', msg.userId);
  console.log('   内容:', msg.text);
  
  // 发送到 OpenCode
  console.log('   🤖 发送给 OpenCode...');
  try {
    const startTime = Date.now();
    const response = await provider.processMessage(msg.text);
    const duration = Date.now() - startTime;
    
    console.log(`   ✅ OpenCode 回复 (${duration}ms):`);
    console.log('   ', response?.substring(0, 200) + (response?.length > 200 ? '...' : ''));
    
    // 发送回微信
    if (response) {
      console.log('   📤 发送回微信...');
      await bot.sendTyping(msg.userId);
      await bot.reply(msg, response);
      console.log('   ✅ 已发送');
    }
  } catch (err) {
    console.error('   ❌ 处理失败:', err.message);
  }
});

console.log('   ✅ 消息处理已设置');
console.log('\n4. 开始监听消息...');
console.log('   请发送一条消息到微信\n');

// 运行 30 秒
setTimeout(() => {
  console.log('\n\n=== 测试结束 ===');
  console.log(`共处理 ${messageCount} 条消息`);
  bot.stop();
  process.exit(0);
}, 30000);

await bot.run();
