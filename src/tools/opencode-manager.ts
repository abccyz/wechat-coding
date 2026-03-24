import { exec, execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface OpenCodeProcess {
  pid: number;
  cwd: string;
  startTime: Date;
  managed: boolean;
}

export interface SwitchCommand {
  type: 'switch' | 'list' | 'status' | 'pwd' | 'kill' | 'unknown';
  targetPath?: string;
  mode?: 'strong' | 'weak';
}

export class OpenCodeManager {
  private processes: Map<number, OpenCodeProcess> = new Map();
  private strongMode: boolean = false;
  private currentManagedDir: string | null = null;

  /**
   * 启用/禁用强管模式
   */
  setStrongMode(enabled: boolean) {
    this.strongMode = enabled;
    if (enabled) {
      this.scanProcesses();
    }
  }

  isStrongMode(): boolean {
    return this.strongMode;
  }

  /**
   * 扫描所有 OpenCode 进程
   */
  scanProcesses(): OpenCodeProcess[] {
    const processes: OpenCodeProcess[] = [];
    
    try {
      const output = execSync('pgrep -f "bin/\\.opencode$"', { 
        encoding: 'utf-8',
        timeout: 5000 
      });
      
      const pids = output.trim().split('\n').filter(p => p);
      
      for (const pidStr of pids) {
        const pid = parseInt(pidStr, 10);
        if (isNaN(pid)) continue;
        
        try {
          const cwdOutput = execSync(`lsof -p ${pid} | grep " cwd " | awk '{print $9}'`, {
            encoding: 'utf-8',
            timeout: 2000
          });
          const cwd = cwdOutput.trim();
          
          const process: OpenCodeProcess = {
            pid,
            cwd,
            startTime: new Date(),
            managed: this.strongMode
          };
          
          processes.push(process);
          this.processes.set(pid, process);
        } catch {
          // 进程可能已退出
        }
      }
    } catch {
      // 没有进程运行
    }
    
    return processes;
  }

  /**
   * 获取当前 OpenCode 进程的工作目录
   */
  async getCurrentWorkingDir(): Promise<string | null> {
    try {
      const processes = this.getProcesses();
      if (processes.length === 0) {
        return null;
      }
      
      // 按启动时间排序，取最近的
      const sorted = processes.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
      return sorted[0].cwd;
    } catch {
      return null;
    }
  }

  /**
   * 获取正在运行的 OpenCode 进程 PID
   */
  async getCurrentPid(): Promise<number | null> {
    try {
      const result = execSync('pgrep -f "bin/\\.opencode$" | head -1', {
        encoding: 'utf-8',
        timeout: 5000
      });
      const pid = parseInt(result.trim(), 10);
      return isNaN(pid) ? null : pid;
    } catch {
      return null;
    }
  }

  /**
   * 杀死指定进程
   */
  killProcess(pid: number): boolean {
    try {
      execSync(`kill -9 ${pid} 2>/dev/null || true`, { timeout: 5000 });
      this.processes.delete(pid);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 杀死当前 OpenCode 进程
   */
  async killOpenCode(): Promise<boolean> {
    try {
      execSync('pkill -f "bin/\\.opencode$"', { timeout: 5000 });
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 杀死所有 OpenCode 进程
   */
  killAllProcesses(): number {
    let killed = 0;
    
    for (const [pid] of this.processes) {
      if (this.killProcess(pid)) {
        killed++;
      }
    }
    
    // 再次尝试全局杀死
    try {
      execSync('pkill -f "bin/\\.opencode$" 2>/dev/null || true', { timeout: 5000 });
      killed++;
    } catch {}
    
    this.processes.clear();
    return killed;
  }

  /**
   * 在新目录启动 OpenCode
   */
  async startInDirectory(targetPath: string): Promise<{ success: boolean; pid?: number; message: string }> {
    if (!fs.existsSync(targetPath)) {
      return { success: false, message: `目录不存在: ${targetPath}` };
    }

    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
      return { success: false, message: `不是目录: ${targetPath}` };
    }

    const resolvedPath = path.resolve(targetPath);

    // 强管模式：先杀死所有进程
    if (this.strongMode) {
      this.killAllProcesses();
      await new Promise(r => setTimeout(r, 500));
    }

    try {
      const child = spawn('opencode', [resolvedPath], {
        detached: true,
        stdio: 'ignore',
        cwd: resolvedPath,
        env: { ...process.env, OPENCODE_PID: '' }
      });
      
      child.unref();
      
      await new Promise(r => setTimeout(r, 1000));
      
      // 验证启动成功
      const newPid = this.findProcessByCwd(resolvedPath);
      
      if (newPid) {
        this.currentManagedDir = resolvedPath;
        this.processes.set(newPid, {
          pid: newPid,
          cwd: resolvedPath,
          startTime: new Date(),
          managed: true
        });
        
        return { 
          success: true, 
          pid: newPid,
          message: `✅ OpenCode 已启动\n📁 目录: ${resolvedPath}\n🔢 PID: ${newPid}` 
        };
      } else {
        return { success: false, message: '启动失败：无法确认进程' };
      }
    } catch (error) {
      return { 
        success: false, 
        message: `启动失败: ${error instanceof Error ? error.message : '未知错误'}` 
      };
    }
  }

  /**
   * 查找指定目录的 OpenCode 进程
   */
  findProcessByCwd(cwd: string): number | null {
    try {
      const output = execSync('pgrep -f "bin/\\.opencode$"', { 
        encoding: 'utf-8',
        timeout: 5000 
      });
      
      const pids = output.trim().split('\n').filter(p => p);
      
      for (const pidStr of pids) {
        const pid = parseInt(pidStr, 10);
        if (isNaN(pid)) continue;
        
        try {
          const cwdOutput = execSync(`lsof -p ${pid} | grep " cwd " | awk '{print $9}'`, {
            encoding: 'utf-8',
            timeout: 2000
          });
          const processCwd = cwdOutput.trim();
          
          if (processCwd === cwd || processCwd.startsWith(cwd)) {
            return pid;
          }
        } catch {}
      }
    } catch {}
    
    return null;
  }

  /**
   * 获取当前管理的目录
   */
  getCurrentDirectory(): string | null {
    return this.currentManagedDir;
  }

  /**
   * 获取所有进程状态
   */
  getProcesses(): OpenCodeProcess[] {
    // 刷新进程列表
    this.scanProcesses();
    return Array.from(this.processes.values());
  }

  /**
   * 解析微信消息中的命令
   */
  parseCommand(message: string): SwitchCommand {
    const trimmed = message.trim();
    
    // 切换目录命令
    const switchPatterns = [
      /^cd\s+(.+)$/i,
      /^切换到\s+(.+)$/i,
      /^switch\s+(.+)$/i,
      /^goto\s+(.+)$/i,
      /^跳转\s+(.+)$/i
    ];
    
    for (const pattern of switchPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        let targetPath = match[1].trim();
        
        // 处理 ~
        if (targetPath.startsWith('~')) {
          targetPath = targetPath.replace('~', process.env.HOME || '');
        }
        
        // 处理相对路径
        if (!targetPath.startsWith('/')) {
          // 如果是数字，可能是项目编号
          if (/^\d+$/.test(targetPath)) {
            return { type: 'switch', targetPath };
          }
        }
        
        return { type: 'switch', targetPath };
      }
    }
    
    // 列表命令
    if (/^list$/i.test(trimmed) || /^列表$/i.test(trimmed) || /^ls$/i.test(trimmed)) {
      return { type: 'list' };
    }
    
    // 状态命令（完整状态）
    if (/^status$/i.test(trimmed) || /^状态$/i.test(trimmed) || /^st$/i.test(trimmed)) {
      return { type: 'status' };
    }
    
    // 当前工作路径查询（简化版）
    if (/当前.*工作.*路径|当前.*目录|^pwd$|^where$|^which.*dir/i.test(trimmed)) {
      return { type: 'pwd' };
    }
    
    // 杀死命令
    if (/^kill$/i.test(trimmed) || /^停止$/i.test(trimmed) || /^结束$/i.test(trimmed)) {
      return { type: 'kill' };
    }
    
    // 强管/弱管模式切换
    const modeMatch = trimmed.match(/^(strong|weak)模式?$/i) || 
                      trimmed.match(/^模式\s+(strong|weak)$/i) ||
                      trimmed.match(/^setmode\s+(strong|weak)$/i);
    if (modeMatch) {
      return { 
        type: 'unknown', 
        mode: modeMatch[1].toLowerCase() as 'strong' | 'weak' 
      };
    }
    
    return { type: 'unknown' };
  }

  /**
   * 执行命令并返回回复消息
   */
  async executeCommand(command: SwitchCommand): Promise<string> {
    switch (command.type) {
      case 'switch':
        if (!command.targetPath) {
          return '❌ 请提供目录路径\n用法: cd /path/to/dir';
        }
        const result = await this.startInDirectory(command.targetPath);
        return result.message;
        
      case 'list':
        const processes = this.getProcesses();
        if (processes.length === 0) {
          return '📂 没有运行的 OpenCode 进程';
        }
        let msg = '📁 OpenCode 进程列表:\n';
        processes.forEach((p, i) => {
          const managed = p.managed ? '✅' : '⚪';
          msg += `${managed} ${i + 1}. PID:${p.pid} - ${p.cwd}\n`;
        });
        return msg;
        
      case 'status':
        const current = this.getCurrentDirectory();
        const currentCwd = await this.getCurrentWorkingDir();
        const procs = this.getProcesses();
        
        let status = `🔍 OpenCode 状态:\n`;
        status += `管理模式: ${this.strongMode ? '🔒 强管' : '🔓 弱管'}\n`;
        status += `运行进程: ${procs.length} 个\n\n`;
        
        if (currentCwd) {
          status += `📁 当前工作目录:\n${currentCwd}\n\n`;
        } else if (current) {
          status += `📁 当前工作目录:\n${current}\n\n`;
        } else {
          status += `⚠️ 未检测到运行中的 OpenCode\n\n`;
        }
        
        if (procs.length > 0) {
          status += `进程详情:\n`;
          procs.forEach((p, i) => {
            const cwdShort = p.cwd.length > 50 ? p.cwd.substring(0, 50) + '...' : p.cwd;
            status += `  ${i + 1}. PID:${p.pid} - ${cwdShort}\n`;
          });
        }
        return status;
        
      case 'pwd':
        const workingDir = await this.getCurrentWorkingDir();
        if (workingDir) {
          return `📁 当前工作目录:\n${workingDir}`;
        }
        
        const managedDir = this.getCurrentDirectory();
        if (managedDir) {
          return `📁 当前工作目录:\n${managedDir}`;
        }
        
        const allProcs = this.getProcesses();
        if (allProcs.length > 0) {
          const sorted = allProcs.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
          const latest = sorted[0];
          return `📁 当前工作目录:\n${latest.cwd}\n\n(发现 ${allProcs.length} 个 OpenCode 进程，显示最近启动的)`;
        }
        
        return '⚠️ 未检测到运行中的 OpenCode 进程\n\n请先启动 OpenCode 或在某个目录运行 opencode 命令。';
        
      case 'kill':
        const killed = this.killAllProcesses();
        return `💀 已停止 ${killed} 个进程`;
        
      default:
        return `❓ 未知命令\n
可用命令:\n` +
               `cd /path/to/dir - 切换到指定目录\n` +
               `list - 列出所有进程\n` +
               `status - 查看状态\n` +
               `kill - 停止所有进程\n` +
               `strong模式 - 启用强管模式\n` +
               `weak模式 - 启用弱管模式`;
    }
  }
}

export const opencodeManager = new OpenCodeManager();
