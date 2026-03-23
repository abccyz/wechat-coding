import { CLIProviderFactory } from './web/cli-providers/index.ts';

console.log('=== 测试 OpenCode 完整流程 ===\n');

// 1. 创建 provider
const config = {
  enabled: true,
  provider: 'opencode',
  model: 'build',
  timeout: 30000
};

const provider = CLIProviderFactory.createProvider(config);

console.log('1. Provider 创建成功:', provider.getName());
console.log('2. 是否启用:', provider.isEnabled());

// 2. 测试处理消息
console.log('\n3. 测试处理消息...');
const testMessage = '你好，请介绍一下自己';
console.log('   发送消息:', testMessage);

try {
  const response = await provider.processMessage(testMessage);
  console.log('   ✅ 收到回复:', response);
} catch (err) {
  console.error('   ❌ 错误:', err.message);
}
