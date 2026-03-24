import { exec, execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
  private isWindows: boolean = os.platform() === 'win32';

  setStrongMode(enabled: boolean) {
    this.strongMode = enabled;
    if (enabled) {
      this.scanProcesses();
    }
  }

  isStrongMode(): boolean {
    return this.strongMode;
  }

  private getOpenCodePattern(): string {
    return this.isWindows ? 'opencode' : 'bin/\\.opencode$';
  }

  scanProcesses(): OpenCodeProcess[] {
    const processes: OpenCodeProcess[] = [];
    
    try {
      let output: string;
      
      if (this.isWindows) {
        // Windows: 使用 wmic 或 tasklist
        try {
          output = execSync('wmic process where "name like \'%opencode%\'" get ProcessId,CommandLine /format:csv', {
            encoding: 'utf-8',
            timeout: 5000
          });
          const lines = output.trim().split('\n').filter(line => line.includes('opencode'));
          for (const line of lines) {
            const parts = line.split(',');
            const pid = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(pid)) {
              try {
                const cwd = this.getProcessCwdWindows(pid);
                if (cwd) {
                  const proc: OpenCodeProcess = {
                    pid,
                    cwd,
                    startTime: new Date(),
                    managed: this.strongMode
                  };
                  processes.push(proc);
                  this.processes.set(pid, proc);
                }
              } catch {}
            }
          }
        } catch {
          // 备用方案：使用 tasklist
          try {
            output = execSync('tasklist /FI "IMAGENAME eq opencode.exe" /FO CSV', {
              encoding: 'utf-8',
              timeout: 5000
            });
            const lines = output.trim().split('\n').slice(1);
            for (const line of lines) {
              const match = line.match(/"opencode\.exe","(\d+)"/);
              if (match) {
                const pid = parseInt(match[1], 10);
                try {
                  const cwd = this.getProcessCwdWindows(pid);
                  if (cwd) {
                    const proc: OpenCodeProcess = {
                      pid,
                      cwd,
                      startTime: new Date(),
                      managed: this.strongMode
                    };
                    processes.push(proc);
                    this.processes.set(pid, proc);
                  }
                } catch {}
              }
            }
          } catch {}
        }
      } else {
        // Unix-like (macOS/Linux)
        output = execSync('pgrep -f "bin/\\.opencode$"', {
          encoding: 'utf-8',
          timeout: 5000
        });
        
        const pids = output.trim().split('\n').filter(p => p);
        
        for (const pidStr of pids) {
          const pid = parseInt(pidStr, 10);
          if (isNaN(pid)) continue;
          
          try {
            const cwd = this.getProcessCwdUnix(pid);
            if (cwd) {
              const proc: OpenCodeProcess = {
                pid,
                cwd,
                startTime: new Date(),
                managed: this.strongMode
              };
              processes.push(proc);
              this.processes.set(pid, proc);
            }
          } catch {}
        }
      }
    } catch {
      // 没有进程运行
    }
    
    return processes;
  }

  private getProcessCwdWindows(pid: number): string | null {
    try {
      // 使用 PowerShell 获取进程工作目录
      const output = execSync(`powershell -Command "(Get-Process -Id ${pid}).Path"`, {
        encoding: 'utf-8',
        timeout: 2000
      });
      const exePath = output.trim();
      if (exePath) {
        return path.dirname(exePath);
      }
    } catch {}
    
    // 备用方案：尝试读取环境变量
    try {
      const output = execSync(`wmic process where "ProcessId=${pid}" get ExecutablePath /value`, {
        encoding: 'utf-8',
        timeout: 2000
      });
      const match = output.match(/ExecutablePath=(.+)/);
      if (match) {
        return path.dirname(match[1].trim());
      }
    } catch {}
    
    return null;
  }

  private getProcessCwdUnix(pid: number): string | null {
    try {
      const output = execSync(`lsof -p ${pid} | grep " cwd " | awk '{print $9}'`, {
        encoding: 'utf-8',
        timeout: 2000
      });
      return output.trim() || null;
    } catch {
      // 备用方案：读取 /proc/PID/cwd
      try {
        const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
        return cwd;
      } catch {}
    }
    return null;
  }

  async getCurrentWorkingDir(): Promise<string | null> {
    const processes = this.getProcesses();
    if (processes.length === 0) {
      return null;
    }
    const sorted = processes.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    return sorted[0].cwd;
  }

  async getCurrentPid(): Promise<number | null> {
    try {
      if (this.isWindows) {
        const output = execSync('tasklist /FI "IMAGENAME eq opencode.exe" /FO CSV', {
          encoding: 'utf-8',
          timeout: 5000
        });
        const match = output.match(/"opencode\.exe","(\d+)"/);
        if (match) {
          return parseInt(match[1], 10);
        }
      } else {
        const output = execSync('pgrep -f "bin/\\.opencode$" | head -1', {
          encoding: 'utf-8',
          timeout: 5000
        });
        const pid = parseInt(output.trim(), 10);
        return isNaN(pid) ? null : pid;
      }
    } catch {}
    return null;
  }

  killProcess(pid: number): boolean {
    try {
      if (this.isWindows) {
        execSync(`taskkill /PID ${pid} /F`, { timeout: 5000 });
      } else {
        execSync(`kill -9 ${pid} 2>/dev/null || true`, { timeout: 5000 });
      }
      this.processes.delete(pid);
      return true;
    } catch {
      return false;
    }
  }

  async killOpenCode(): Promise<boolean> {
    try {
      if (this.isWindows) {
        execSync('taskkill /IM opencode.exe /F', { timeout: 5000 });
      } else {
        execSync('pkill -f "bin/\\.opencode$"', { timeout: 5000 });
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    } catch {
      return false;
    }
  }

  killAllProcesses(): number {
    let killed = 0;
    
    for (const [pid] of this.processes) {
      if (this.killProcess(pid)) {
        killed++;
      }
    }
    
    if (this.isWindows) {
      try {
        execSync('taskkill /IM opencode.exe /F 2>nul || exit 0', { timeout: 5000 });
        killed++;
      } catch {}
    } else {
      try {
        execSync('pkill -f "bin/\\.opencode$" 2>/dev/null || true', { timeout: 5000 });
        killed++;
      } catch {}
    }
    
    this.processes.clear();
    return killed;
  }

  async startInDirectory(targetPath: string): Promise<{ success: boolean; pid?: number; message: string }> {
    if (!fs.existsSync(targetPath)) {
      return { success: false, message: `目录不存在: ${targetPath}` };
    }

    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
      return { success: false, message: `不是目录: ${targetPath}` };
    }

    const resolvedPath = path.resolve(targetPath);

    if (this.strongMode) {
      this.killAllProcesses();
      await new Promise(r => setTimeout(r, 500));
    }

    try {
      const child = spawn('opencode', [resolvedPath], {
        detached: !this.isWindows,
        stdio: 'ignore',
        cwd: resolvedPath,
        env: { ...process.env, OPENCODE_PID: '' }
      });
      
      if (!this.isWindows) {
        child.unref();
      }
      
      await new Promise(r => setTimeout(r, 1000));
      
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

  findProcessByCwd(cwd: string): number | null {
    const processes = this.getProcesses();
    for (const proc of processes) {
      if (proc.cwd === cwd || proc.cwd.startsWith(cwd)) {
        return proc.pid;
      }
    }
    return null;
  }

  getCurrentDirectory(): string | null {
    return this.currentManagedDir;
  }

  getProcesses(): OpenCodeProcess[] {
    this.scanProcesses();
    return Array.from(this.processes.values());
  }

  parseCommand(message: string): SwitchCommand {
    const trimmed = message.trim();
    
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
        
        if (targetPath.startsWith('~')) {
          targetPath = targetPath.replace('~', os.homedir());
        }
        
        if (!path.isAbsolute(targetPath)) {
          if (/^\d+$/.test(targetPath)) {
            return { type: 'switch', targetPath };
          }
          targetPath = path.resolve(process.cwd(), targetPath);
        }
        
        return { type: 'switch', targetPath };
      }
    }
    
    if (/^list$/i.test(trimmed) || /^列表$/i.test(trimmed) || /^ls$/i.test(trimmed)) {
      return { type: 'list' };
    }
    
    if (/^status$/i.test(trimmed) || /^状态$/i.test(trimmed) || /^st$/i.test(trimmed)) {
      return { type: 'status' };
    }
    
    if (/当前.*工作.*路径|当前.*目录|^pwd$|^where$|^which.*dir/i.test(trimmed)) {
      return { type: 'pwd' };
    }
    
    if (/^kill$/i.test(trimmed) || /^停止$/i.test(trimmed) || /^结束$/i.test(trimmed)) {
      return { type: 'kill' };
    }
    
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
