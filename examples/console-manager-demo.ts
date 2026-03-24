/**
 * CLI Console Manager 使用示例
 * 
 * 展示如何使用新的控制台管理模块
 */

import {
  consoleManagerService,
  ConsoleManagerFactory,
  ConsoleManagerType,
  OpenCodeConsoleManager,
  ClaudeCodeConsoleManager
} from '../web/console-manager/index.ts';

async function examples() {
  console.log('=== CLI Console Manager 示例 ===\n');

  // ========== 示例 1: 使用服务层 ==========
  console.log('示例 1: 使用 ConsoleManagerService');
  console.log('----------------------------------------');

  // 设置当前活动的 CLI 类型
  consoleManagerService.setCurrentManager('opencode');

  // 解析命令
  const commands = [
    'cd /path/to/project',
    'start',
    'status',
    'list',
    'stop'
  ];

  for (const cmd of commands) {
    const parsed = consoleManagerService.parseCommand(cmd);
    console.log(`命令: "${cmd}" -> 类型: ${parsed.type}`);
  }

  // 执行命令（注释掉，避免实际执行）
  // const result = await consoleManagerService.executeCommand({ type: 'status' });
  // console.log('结果:', result.message);

  console.log('\n');

  // ========== 示例 2: 使用工厂 ==========
  console.log('示例 2: 使用 ConsoleManagerFactory');
  console.log('----------------------------------------');

  // 获取所有可用的 CLI 类型
  const availableManagers = ConsoleManagerFactory.getAvailableManagers();
  console.log('可用的 CLI 工具:');
  availableManagers.forEach(m => {
    console.log(`  • ${m.name}: ${m.description}`);
  });

  // 创建特定的管理器
  const opencodeManager = ConsoleManagerFactory.createManager('opencode');
  console.log(`\n创建的 OpenCode 管理器: ${opencodeManager.getName()}`);

  const claudeManager = ConsoleManagerFactory.createManager('claude-code');
  console.log(`创建的 Claude Code 管理器: ${claudeManager.getName()}`);

  console.log('\n');

  // ========== 示例 3: 直接使用管理器 ==========
  console.log('示例 3: 直接使用管理器');
  console.log('----------------------------------------');

  const manager = new OpenCodeConsoleManager();
  console.log(`名称: ${manager.getName()}`);
  console.log(`描述: ${manager.getDescription()}`);
  console.log(`安装命令: ${manager.getInstallCommand()}`);

  // 检查是否已安装
  const isInstalled = await manager.isInstalled();
  console.log(`是否已安装: ${isInstalled ? '是' : '否'}`);

  // 如果已安装，获取版本
  if (isInstalled) {
    const version = await manager.getVersion();
    console.log(`版本: ${version || '未知'}`);
  }

  console.log('\n');

  // ========== 示例 4: 进程管理 ==========
  console.log('示例 4: 进程管理（仅演示，不执行）');
  console.log('----------------------------------------');

  console.log('启动 CLI:');
  console.log('  await manager.start({ directory: "/path/to/project" })');
  console.log('  // -> { success: true, pid: 12345, message: "OpenCode 已启动..." }');

  console.log('\n获取状态:');
  console.log('  await manager.getStatus()');
  console.log('  // -> { pid: 12345, cwd: "/path/to/project", isRunning: true, uptime: 3600 }');

  console.log('\n切换目录:');
  console.log('  await manager.switchDirectory("/another/project")');
  console.log('  // -> { success: true, pid: 12346, message: "已切换到新目录..." }');

  console.log('\n停止 CLI:');
  console.log('  await manager.stop({ force: false })');
  console.log('  // -> { success: true, message: "已停止 1 个进程", stoppedCount: 1 }');

  console.log('\n=== 示例结束 ===');
}

// 运行示例
examples().catch(console.error);

// ========== 微信命令集成示例 ==========
console.log('\n=== 微信命令集成示例 ===\n');

import {
  parseConsoleCommand,
  executeConsoleCommand,
  switchDirectory,
  getActiveCLIType,
  setActiveCLIType
} from '../web/console-integration.ts';

async function wechatIntegrationExample() {
  // 模拟微信消息
  const messages = [
    'cd ~/projects/my-app',
    'start',
    'status',
    'list',
    'stop',
    '启动 claude-code',
    '停止 opencode',
    'restart',
    '版本'
  ];

  console.log('微信命令解析示例:');
  console.log('----------------------------------------');

  for (const msg of messages) {
    const parsed = parseConsoleCommand(msg);
    console.log(`"${msg}" -> 类型: ${parsed.type}${parsed.command ? `, 命令: ${parsed.command}` : ''}${parsed.targetPath ? `, 路径: ${parsed.targetPath}` : ''}`);
  }

  // 设置活动 CLI
  setActiveCLIType('opencode');
  console.log(`\n当前活动 CLI: ${getActiveCLIType()}`);

  // 注意：下面的命令会实际执行，演示时请谨慎
  // const result = await executeConsoleCommand('status');
  // console.log('状态结果:', result);
}

wechatIntegrationExample().catch(console.error);
