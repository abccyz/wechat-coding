#!/usr/bin/env node
/**
 * OpenCode 目录切换器 - 极简版
 * 核心逻辑：结束旧进程 → 在新目录启动
 */

import { execSync, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

function log(msg: string) {
  console.log(msg);
}

function resolvePath(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    return inputPath.replace('~', process.env.HOME || '');
  }
  return path.resolve(inputPath);
}

function killOpenCode() {
  try {
    execSync('pkill -f "bin/\\.opencode$" 2>/dev/null', { timeout: 5000 });
  } catch {
    // 进程可能不存在，忽略错误
  }
}

async function switchDirectory(targetPath: string) {
  // 1. 验证目录
  const resolvedPath = resolvePath(targetPath);
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ 目录不存在: ${resolvedPath}`);
    process.exit(1);
  }

  const stats = fs.statSync(resolvedPath);
  if (!stats.isDirectory()) {
    console.error(`❌ 不是目录: ${resolvedPath}`);
    process.exit(1);
  }

  log(`📁 目标目录: ${resolvedPath}`);

  // 2. 结束旧进程
  log('🛑 停止现有 OpenCode 进程...');
  killOpenCode();
  await new Promise(r => setTimeout(r, 500));

  // 3. 在新目录启动
  log('🚀 启动 OpenCode...');
  
  const child = spawn('opencode', [resolvedPath], {
    detached: true,
    stdio: 'ignore',
    cwd: resolvedPath,
    env: { ...process.env, OPENCODE_PID: '' }
  });
  
  child.unref();
  
  // 等待一下确认启动
  await new Promise(r => setTimeout(r, 1000));
  
  log('✅ OpenCode 已在新目录启动');
  log(`   目录: ${resolvedPath}`);
}

// 主入口
const targetPath = process.argv[2];

if (!targetPath) {
  console.log(`
使用方法:
  npm run switch <目录路径>

示例:
  npm run switch /path/to/project
  npm run switch ~/projects/myapp
  npm run switch ..
  npm run switch 3  (切换到上级目录的第3个子目录)
`);
  process.exit(0);
}

switchDirectory(targetPath).catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
