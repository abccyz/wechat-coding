import { exec, execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface OpenCodeProject {
  id: string;
  path: string;
  name: string;
  lastUsed: Date;
  sessionCount: number;
}

export interface SwitchResult {
  success: boolean;
  message: string;
  previousDir?: string;
  newDir?: string;
  pid?: number;
}

export class OpenCodeDirManager {
  private dbPath: string;
  private currentPid?: number;

  constructor() {
    this.dbPath = path.join(os.homedir(), '.local/share/opencode/opencode.db');
  }

  /**
   * 检查 OpenCode 数据库是否存在
   */
  private checkDatabase(): boolean {
    return fs.existsSync(this.dbPath);
  }

  /**
   * 执行 SQLite 查询
   */
  private async query(sql: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = exec(`sqlite3 "${this.dbPath}" "${sql}"`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  /**
   * 获取当前 OpenCode 进程的工作目录
   */
  async getCurrentWorkingDir(): Promise<string | null> {
    try {
      const result = execSync('lsof -c opencode | grep " cwd " | head -1 | awk \'{print $9}\'', {
        encoding: 'utf-8',
        timeout: 5000
      });
      return result.trim() || null;
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
   * 获取所有项目列表
   */
  async listProjects(): Promise<OpenCodeProject[]> {
    if (!this.checkDatabase()) {
      return [];
    }

    try {
      const sql = `
        SELECT 
          p.id,
          p.path,
          COALESCE(p.name, substr(p.path, instr(p.path, '/') + 1)) as name,
          max(s.time_updated) as last_used,
          count(s.id) as session_count
        FROM project p
        JOIN session s ON p.id = s.project_id
        GROUP BY p.id
        ORDER BY max(s.time_updated) DESC
        LIMIT 50;
      `;

      const output = await this.query(sql);
      if (!output) return [];

      return output.split('\n').map(line => {
        const [id, projectPath, name, lastUsed, sessionCount] = line.split('|');
        return {
          id,
          path: projectPath,
          name: name || path.basename(projectPath),
          lastUsed: new Date(parseInt(lastUsed, 10)),
          sessionCount: parseInt(sessionCount, 10) || 0
        };
      });
    } catch (error) {
      console.error('Failed to list projects:', error);
      return [];
    }
  }

  /**
   * 通过路径获取项目信息
   */
  async getProjectByPath(projectPath: string): Promise<OpenCodeProject | null> {
    if (!this.checkDatabase()) return null;

    try {
      const sql = `
        SELECT 
          p.id,
          p.path,
          COALESCE(p.name, substr(p.path, instr(p.path, '/') + 1)) as name,
          max(s.time_updated) as last_used,
          count(s.id) as session_count
        FROM project p
        JOIN session s ON p.id = s.project_id
        WHERE p.path = '${projectPath}'
        GROUP BY p.id
        LIMIT 1;
      `;

      const output = await this.query(sql);
      if (!output) return null;

      const [id, path, name, lastUsed, sessionCount] = output.split('|');
      return {
        id,
        path,
        name: name || path,
        lastUsed: new Date(parseInt(lastUsed, 10)),
        sessionCount: parseInt(sessionCount, 10) || 0
      };
    } catch {
      return null;
    }
  }

  /**
   * 通过 ID 或索引获取项目
   */
  async getProjectByIdOrIndex(idOrIndex: string): Promise<OpenCodeProject | null> {
    if (!this.checkDatabase()) return null;

    const projects = await this.listProjects();
    
    if (/^\d+$/.test(idOrIndex)) {
      const index = parseInt(idOrIndex, 10) - 1;
      if (index >= 0 && index < projects.length) {
        return projects[index];
      }
    }

    return projects.find(p => p.id === idOrIndex || p.path.includes(idOrIndex)) || null;
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
   * 切换工作目录
   */
  async switchToDirectory(targetPath: string): Promise<SwitchResult> {
    const previousDir = await this.getCurrentWorkingDir();

    if (!fs.existsSync(targetPath)) {
      return {
        success: false,
        message: `目录不存在: ${targetPath}`,
        previousDir: previousDir || undefined
      };
    }

    const resolvedPath = path.resolve(targetPath);

    if (previousDir === resolvedPath) {
      return {
        success: true,
        message: `已经在目标目录: ${resolvedPath}`,
        previousDir: previousDir || undefined,
        newDir: resolvedPath
      };
    }

    try {
      await this.killOpenCode();
      
      return {
        success: true,
        message: `已停止旧进程，准备在新目录启动`,
        previousDir: previousDir || undefined,
        newDir: resolvedPath
      };
    } catch (error) {
      return {
        success: false,
        message: `切换失败: ${error instanceof Error ? error.message : '未知错误'}`,
        previousDir: previousDir || undefined
      };
    }
  }

  /**
   * 在新目录启动 OpenCode
   */
  async startOpenCode(targetPath: string): Promise<SwitchResult> {
    const previousDir = await this.getCurrentWorkingDir();

    if (!fs.existsSync(targetPath)) {
      return {
        success: false,
        message: `目录不存在: ${targetPath}`,
        previousDir: previousDir || undefined
      };
    }

    try {
      await this.killOpenCode();
      
      const resolvedPath = path.resolve(targetPath);
      
      const child = spawn('opencode', [resolvedPath], {
        detached: true,
        stdio: 'ignore',
        cwd: resolvedPath,
        env: { ...process.env, OPENCODE_PID: '' }
      });
      
      child.unref();
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newPid = await this.getCurrentPid();

      return {
        success: true,
        message: `OpenCode 已在新目录启动`,
        previousDir: previousDir || undefined,
        newDir: resolvedPath,
        pid: newPid || undefined
      };
    } catch (error) {
      return {
        success: false,
        message: `启动失败: ${error instanceof Error ? error.message : '未知错误'}`,
        previousDir: previousDir || undefined
      };
    }
  }

  /**
   * 显示项目列表（格式化输出）
   */
  async printProjects(): Promise<void> {
    const projects = await this.listProjects();
    const currentDir = await this.getCurrentWorkingDir();

    if (projects.length === 0) {
      console.log('📂 没有找到任何项目记录');
      return;
    }

    console.log('\n📁 OpenCode 项目列表');
    console.log('────────────────────────────────────────────────────────────────────────────────\n');

    projects.forEach((project, index) => {
      const isCurrent = project.path === currentDir;
      const marker = isCurrent ? '●' : ' ';
      const lastUsed = project.lastUsed.toLocaleString('zh-CN', { 
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const displayPath = project.path.length > 40 
        ? '...' + project.path.slice(-37) 
        : project.path;
      
      console.log(`  ${marker} ${(index + 1).toString().padStart(2)}. ${project.name.padEnd(25)}  ${lastUsed}  (${project.sessionCount} 会话)`);
      console.log(`      ${displayPath}${isCurrent ? '  ← 当前' : ''}`);
      console.log();
    });

    console.log('────────────────────────────────────────────────────────────────────────────────');
    console.log('使用: npm run switch <编号|路径>  切换到指定项目\n');
  }

  /**
   * 显示当前状态
   */
  async printStatus(): Promise<void> {
    const pid = await this.getCurrentPid();
    const cwd = await this.getCurrentWorkingDir();

    console.log('\n🔍 OpenCode 状态');
    console.log('────────────────────────────────────────────────────────────────────────────────\n');

    if (pid) {
      console.log(`  ✅ 运行中`);
      console.log(`  PID: ${pid}`);
      console.log(`  工作目录: ${cwd || '未知'}`);
    } else {
      console.log(`  ⏹️  未运行`);
    }

    console.log('\n────────────────────────────────────────────────────────────────────────────────\n');
  }

  /**
   * 清理无效的项目记录
   */
  async cleanInvalidProjects(): Promise<{ cleaned: number; errors: string[] }> {
    if (!this.checkDatabase()) {
      return { cleaned: 0, errors: ['数据库不存在'] };
    }

    const errors: string[] = [];
    let cleaned = 0;

    try {
      const sql = 'SELECT id, path FROM project;';
      const output = await this.query(sql);
      
      if (!output) return { cleaned: 0, errors };

      const lines = output.split('\n');
      
      for (const line of lines) {
        const [id, projectPath] = line.split('|');
        if (!projectPath || !fs.existsSync(projectPath)) {
          try {
            await this.query(`DELETE FROM project WHERE id = '${id}';`);
            cleaned++;
          } catch (e) {
            errors.push(`删除 ${projectPath} 失败: ${e}`);
          }
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : '未知错误');
    }

    return { cleaned, errors };
  }
}

export const dirManager = new OpenCodeDirManager();
