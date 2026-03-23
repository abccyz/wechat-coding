#!/usr/bin/env node
/**
 * 消息推送测试脚本
 */

const API_URL = 'http://localhost:3000';

async function testStatus() {
  console.log('1. 测试服务器状态...');
  const res = await fetch(`${API_URL}/api/status`);
  const data = await res.json();
  console.log('   状态:', data);
  return data.connected;
}

async function testSendMessage() {
  console.log('\n2. 测试发送消息...');
  
  // 测试格式正确的消息
  const testCases = [
    {
      name: '格式错误（缺少冒号）',
      body: { userId: '', text: '你好' },
      expected: '格式: 用户ID:消息内容'
    },
    {
      name: '有效格式但用户未交互',
      body: { userId: 'test_user_123', text: '你好，这是一条测试消息' },
      expected: 'No cached context token'
    }
  ];
  
  for (const test of testCases) {
    console.log(`\n   测试: ${test.name}`);
    try {
      const res = await fetch(`${API_URL}/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.body)
      });
      const data = await res.json();
      console.log('   结果:', data);
      
      if (data.success) {
        console.log('   ✅ 发送成功');
      } else {
        console.log('   ❌ 发送失败:', data.error);
        if (data.error && data.error.includes(test.expected)) {
          console.log('   ✓ 符合预期错误');
        }
      }
    } catch (err) {
      console.log('   ❌ 请求错误:', err.message);
    }
  }
}

async function main() {
  console.log('=== 消息推送功能测试 ===\n');
  
  const isConnected = await testStatus();
  
  if (!isConnected) {
    console.log('\n❌ 微信机器人未登录，请先扫码登录');
    console.log('   访问: http://localhost:3000');
    process.exit(1);
  }
  
  await testSendMessage();
  
  console.log('\n=== 测试完成 ===');
  console.log('\n注意: 要发送消息给真实用户，需要:');
  console.log('1. 该用户先给机器人发过消息');
  console.log('2. 使用格式: 用户ID:消息内容');
  console.log('3. 在 Web 界面的输入框中发送');
}

main().catch(console.error);
