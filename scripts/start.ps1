# WeChat Coding - Windows 服务管理脚本
# 使用方法: .\scripts\start.ps1 [start|stop|restart|status|logs|dev|build|clean]

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "status", "logs", "dev", "build", "clean", "help")]
    [string]$Command = "help"
)

$PORT = if ($env:PORT) { $env:PORT } else { 3000 }
$PID_FILE = ".server.pid"
$LOG_FILE = "server.log"

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Error($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

function Test-Dependencies {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error "未找到 Node.js，请先安装 Node.js >= 18"
        exit 1
    }
    
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Error "未找到 npm"
        exit 1
    }
    
    if (-not (Test-Path "node_modules")) {
        Write-Warn "未找到 node_modules，正在安装依赖..."
        npm install
        Write-Success "依赖安装完成"
    }
}

function Test-Build {
    if (-not (Test-Path "dist")) {
        Write-Warn "未找到 dist 目录，正在编译..."
        Build-Project
    }
}

function Build-Project {
    Write-Info "正在编译 TypeScript..."
    npm run build
    Write-Success "编译完成"
}

function Kill-ExistingProcesses {
    Write-Info "检查并清理历史进程..."
    
    # 1. 从 PID 文件停止旧进程
    if (Test-Path $PID_FILE) {
        $pid = Get-Content $PID_FILE -ErrorAction SilentlyContinue
        if ($pid) {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Warn "发现遗留进程 (PID: $pid)，正在停止..."
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-Success "已停止遗留进程"
            }
        }
        Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
    }
    
    # 2. 检查并结束占用端口的进程
    $portProcs = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue | 
                 Select-Object -ExpandProperty OwningProcess -Unique
    if ($portProcs) {
        Write-Warn "端口 $PORT 被占用，正在释放..."
        $portProcs | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
        Start-Sleep 1
        Write-Success "已释放端口 $PORT"
    }
    
    # 3. 清理 tsx 进程
    $tsxProcs = Get-Process -Name "tsx" -ErrorAction SilentlyContinue | 
                 Where-Object { $_.CommandLine -like "*web/server*" }
    if ($tsxProcs) {
        Write-Warn "发现 tsx 遗留进程，正在清理..."
        $tsxProcs | Stop-Process -Force
        Write-Success "已清理 tsx 进程"
    }
    
    # 4. 清理 node 进程
    $nodeProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue | 
                  Where-Object { $_.CommandLine -like "*web/server*" }
    if ($nodeProcs) {
        Write-Warn "发现 node 遗留进程，正在清理..."
        $nodeProcs | Stop-Process -Force
        Write-Success "已清理 node 进程"
    }
    
    Write-Success "历史进程清理完成"
    Write-Host ""
}

function Start-Service {
    Test-Dependencies
    Test-Build
    Kill-ExistingProcesses
    
    Write-Info "启动服务..."
    Write-Info "访问地址: http://localhost:$PORT"
    Write-Warn "按 Ctrl+C 停止服务"
    Write-Host ""
    
    $env:PORT = $PORT
    npm run web
}

function Start-Daemon {
    Test-Dependencies
    Test-Build
    Kill-ExistingProcesses
    
    Write-Info "后台启动服务..."
    
    # 使用 Start-Process 后台启动
    $process = Start-Process -FilePath "npm" -ArgumentList "run", "web" `
        -WorkingDirectory $PWD -WindowStyle Hidden `
        -RedirectStandardOutput $LOG_FILE -RedirectStandardError $LOG_FILE -PassThru
    
    $process.Id | Out-File $PID_FILE
    
    Write-Info "等待服务启动..."
    for ($i = 1; $i -le 10; $i++) {
        Start-Sleep 1
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$PORT/api/status" `
                -UseBasicParsing -ErrorAction Stop -TimeoutSec 2
            Write-Success "服务启动成功!"
            Write-Info "访问: http://localhost:$PORT"
            Write-Info "日志: Get-Content $LOG_FILE -Wait"
            return
        }
        catch {
            if ($i -eq 10) {
                Write-Error "启动超时"
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

function Stop-Service {
    if (-not (Test-Path $PID_FILE)) {
        Write-Warn "服务未运行"
        return
    }
    
    $pid = Get-Content $PID_FILE -ErrorAction SilentlyContinue
    if ($pid) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Info "正在停止服务 (PID: $pid)..."
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Start-Sleep 1
            Write-Success "服务已停止"
        }
        else {
            Write-Warn "服务未运行"
        }
    }
    
    Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
}

function Restart-Service {
    Stop-Service
    Start-Sleep 1
    Start-Daemon
}

function Show-Status {
    if (Test-Path $PID_FILE) {
        $pid = Get-Content $PID_FILE -ErrorAction SilentlyContinue
        if ($pid) {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Success "服务运行中 (PID: $pid)"
                Write-Info "访问: http://localhost:$PORT"
                
                try {
                    $response = Invoke-WebRequest -Uri "http://localhost:$PORT/api/status" `
                        -UseBasicParsing -ErrorAction Stop -TimeoutSec 2
                    Write-Success "服务响应正常"
                }
                catch {
                    Write-Warn "服务可能未完全启动"
                }
            }
            else {
                Write-Error "服务未运行 (PID 文件残留)"
                Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
            }
        }
    }
    else {
        Write-Warn "服务未运行"
    }
}

function Show-Logs {
    if (Test-Path $LOG_FILE) {
        Get-Content $LOG_FILE -Wait
    }
    else {
        Write-Error "日志文件不存在: $LOG_FILE"
    }
}

function Start-Dev {
    Test-Dependencies
    Kill-ExistingProcesses
    
    Write-Info "启动开发模式（热重载）..."
    Write-Warn "按 Ctrl+C 停止"
    Write-Host ""
    
    $env:PORT = $PORT
    npx tsx watch web/server.ts
}

function Clean-Project {
    Write-Info "清理编译输出..."
    if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
    if (Test-Path $LOG_FILE) { Remove-Item $LOG_FILE -Force }
    if (Test-Path $PID_FILE) { Remove-Item $PID_FILE -Force }
    Write-Success "清理完成"
}

function Show-Help {
    Write-Host "WeChat Coding - Windows 服务管理脚本"
    Write-Host ""
    Write-Host "用法: .\scripts\start.ps1 [命令]"
    Write-Host ""
    Write-Host "命令:"
    Write-Host "  start     启动服务（前台运行）"
    Write-Host "  daemon    后台启动服务"
    Write-Host "  stop      停止服务"
    Write-Host "  restart   重启服务"
    Write-Host "  status    查看服务状态"
    Write-Host "  logs      查看实时日志"
    Write-Host "  dev       开发模式（热重载）"
    Write-Host "  build     编译项目"
    Write-Host "  clean     清理编译输出"
    Write-Host "  help      显示帮助"
    Write-Host ""
    Write-Host "环境变量:"
    Write-Host "  \$env:PORT = 8080; .\scripts\start.ps1 start"
    Write-Host ""
}

# 主逻辑
switch ($Command) {
    "start" { Start-Service }
    "daemon" { Start-Daemon }
    "stop" { Stop-Service }
    "restart" { Restart-Service }
    "status" { Show-Status }
    "logs" { Show-Logs }
    "dev" { Start-Dev }
    "build" { Build-Project }
    "clean" { Clean-Project }
    default { Show-Help }
}
