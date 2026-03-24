import { CLIConsoleManager, CLIConsoleConfig } from '../base.ts';

const TABBY_CONFIG: CLIConsoleConfig = {
  command: 'tabby',
  installCommand: 'docker run -it -p 8080:8080 -v $HOME/.tabby:/data tabbyml/tabby',
  processPattern: 'tabby',
  supportsDirectory: false, // Tabby 是服务器，通过 Docker 运行
  defaultTimeout: 30000
};

export class TabbyConsoleManager extends CLIConsoleManager {
  constructor() {
    super(TABBY_CONFIG);
  }

  getName(): string {
    return 'Tabby';
  }

  getDescription(): string {
    return 'Tabby - 自托管的 AI 编程助手';
  }

  // Tabby 是 Docker 服务，需要特殊处理
  async start() {
    return {
      success: false,
      message: 'Tabby 需要通过 Docker 手动启动。运行: docker run -it -p 8080:8080 tabbyml/tabby'
    };
  }

  async stop() {
    return {
      success: false,
      message: 'Tabby 是 Docker 容器，请使用 docker stop 停止',
      stoppedCount: 0
    };
  }

  async switchDirectory(): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message: 'Tabby 是服务器，不支持目录切换'
    };
  }
}
