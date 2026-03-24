# WeChat Coding - 微信 AI 编程助手服务管理 Makefile
# 跨平台支持: macOS, Linux, Windows

.PHONY: help start stop restart status logs build clean dev test

# 默认配置
PORT ?= 3000
PID_FILE := .server.pid
LOG_FILE := server.log

# 检测操作系统
ifeq ($(OS),Windows_NT)
    IS_WINDOWS := 1
    SHELL := cmd.exe
    RM := del /Q
    RMDIR := rmdir /S /Q
    NULL := NUL
    CURDIR := $(subst /,\,$(shell cd))
else
    IS_WINDOWS := 0
    RM := rm -f
    RMDIR := rm -rf
    NULL := /dev/null
    CURDIR := $(shell pwd)
endif

# 颜色定义（仅 Unix）
ifeq ($(IS_WINDOWS),1)
    BLUE :=
    GREEN :=
    YELLOW :=
    RED :=
    NC :=
else
    BLUE := \033[0;34m
    GREEN := \033[0;32m
    YELLOW := \033[1;33m
    RED := \033[0;31m
    NC := \033[0m
endif

# 帮助信息
help:
ifeq ($(IS_WINDOWS),1)
	@echo WeChat Coding - 微信 AI 编程助手服务管理
	@echo.
	@echo 用法: make [命令]
	@echo.
	@echo 命令:
	@echo   make start       启动服务（前台运行，Ctrl+C 停止）
	@echo   make daemon      后台启动服务
	@echo   make stop        停止后台服务
	@echo   make restart     重启后台服务
	@echo   make status      查看服务状态
	@echo   make logs        查看实时日志
	@echo   make dev         开发模式（热重载）
	@echo   make build       编译 TypeScript
	@echo   make clean       清理编译输出和日志
	@echo   make test        运行测试
	@echo.
	@echo 环境变量:
	@echo   set PORT=8080 ^& make start    使用自定义端口
	@echo.
	@echo Windows 用户也可以使用 PowerShell 脚本:
	@echo   .\scripts\start.ps1
else
	@echo "$(BLUE)WeChat Coding - 微信 AI 编程助手服务管理$(NC)"
	@echo ""
	@echo "用法: make [命令]"
	@echo ""
	@echo "命令:"
	@echo "  make start       启动服务（前台运行，Ctrl+C 停止）"
	@echo "  make daemon      后台启动服务"
	@echo "  make stop        停止后台服务"
	@echo "  make restart     重启后台服务"
	@echo "  make status      查看服务状态"
	@echo "  make logs        查看实时日志"
	@echo "  make dev         开发模式（热重载）"
	@echo "  make build       编译 TypeScript"
	@echo "  make clean       清理编译输出和日志"
	@echo "  make test        运行测试"
	@echo ""
	@echo "环境变量:"
	@echo "  PORT=8080 make start    使用自定义端口"
	@echo ""
	@echo "快捷命令:"
	@echo "  make                 显示帮助"
	@echo "  make up             等价于 make daemon"
	@echo "  make down           等价于 make stop"
endif

# 默认显示帮助
.DEFAULT_GOAL := help

# 检查依赖 - 跨平台
ifeq ($(IS_WINDOWS),1)
check-deps:
	@where node >$(NULL) 2>&1 || (echo "[ERROR] 未找到 Node.js，请先安装 Node.js >= 18" && exit 1)
	@where npm >$(NULL) 2>&1 || (echo "[ERROR] 未找到 npm" && exit 1)
	@if not exist "node_modules" ( \
		echo "[WARN] 未找到 node_modules，正在安装依赖..." && \
		npm install && \
		echo "[OK] 依赖安装完成" \
	)
else
check-deps:
	@command -v node >$(NULL) 2>&1 || { echo "$(RED)[ERROR]$(NC) 未找到 Node.js，请先安装 Node.js >= 18"; exit 1; }
	@command -v npm >$(NULL) 2>&1 || { echo "$(RED)[ERROR]$(NC) 未找到 npm"; exit 1; }
	@if [ ! -d "node_modules" ]; then \
		echo "$(YELLOW)[WARN]$(NC) 未找到 node_modules，正在安装依赖..."; \
		npm install; \
		echo "$(GREEN)[OK]$(NC) 依赖安装完成"; \
	fi
endif

# 检查是否需要编译
ifeq ($(IS_WINDOWS),1)
check-build:
	@if not exist "dist" ( \
		echo "[WARN] 未找到 dist 目录，正在编译..." && \
		$(MAKE) build \
	)
else
check-build:
	@if [ ! -d "dist" ]; then \
		echo "$(YELLOW)[WARN]$(NC) 未找到 dist 目录，正在编译..."; \
		$(MAKE) build; \
	fi
endif

# 编译项目
ifeq ($(IS_WINDOWS),1)
build: check-deps
	@echo "[INFO] 正在编译 TypeScript..."
	@npm run build
	@echo "[OK] 编译完成"
else
build: check-deps
	@echo "$(BLUE)[INFO]$(NC) 正在编译 TypeScript..."
	@npm run build
	@echo "$(GREEN)[OK]$(NC) 编译完成"
endif

# 清理历史进程 - 跨平台
ifeq ($(IS_WINDOWS),1)
kill-existing:
	@echo "[INFO] 检查并清理历史进程..."
	@powershell -Command "\
		$$pidFile = '$(PID_FILE)'; \
		if (Test-Path $$pidFile) { \
			$$pid = Get-Content $$pidFile; \
			if ($$pid -and (Get-Process -Id $$pid -ErrorAction SilentlyContinue)) { \
				Write-Host '[WARN] 发现遗留进程，正在停止...' -ForegroundColor Yellow; \
				Stop-Process -Id $$pid -Force; \
				Write-Host '[OK] 已停止遗留进程' -ForegroundColor Green; \
			} \
			Remove-Item $$pidFile -Force; \
		} \
		$$portProcs = Get-NetTCPConnection -LocalPort $(PORT) -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess; \
		if ($$portProcs) { \
			Write-Host \"'[WARN] 端口 $(PORT) 被占用，正在释放...'\" -ForegroundColor Yellow; \
			$$portProcs | ForEach-Object { Stop-Process -Id $$_ -Force }; \
			Write-Host '[OK] 已释放端口 $(PORT)' -ForegroundColor Green; \
		} \
	"
	@echo "[OK] 历史进程清理完成"
	@echo.
else
kill-existing:
	@echo "$(BLUE)[INFO]$(NC) 检查并清理历史进程..."
	@if [ -f "$(PID_FILE)" ]; then \
		pid=$$(cat $(PID_FILE) 2>/dev/null); \
		if [ -n "$$pid" ] && ps -p $$pid >$(NULL) 2>&1; then \
			echo "$(YELLOW)[WARN]$(NC) 发现遗留进程 (PID: $$pid)，正在停止..."; \
			kill $$pid 2>/dev/null || true; \
			sleep 1; \
			if ps -p $$pid >$(NULL) 2>&1; then \
				kill -9 $$pid 2>/dev/null || true; \
			fi; \
			echo "$(GREEN)[OK]$(NC) 已停止遗留进程"; \
		fi; \
		$(RM) $(PID_FILE); \
	fi
	@port_pid=$$(lsof -ti:$(PORT) 2>/dev/null); \
	if [ -n "$$port_pid" ]; then \
		echo "$(YELLOW)[WARN]$(NC) 端口 $(PORT) 被占用 (PID: $$port_pid)，正在释放..."; \
		kill -9 $$port_pid 2>/dev/null || true; \
		sleep 1; \
		echo "$(GREEN)[OK]$(NC) 已释放端口 $(PORT)"; \
	fi
	@tsx_pids=$$(pgrep -f "tsx.*web/server" 2>/dev/null); \
	if [ -n "$$tsx_pids" ]; then \
		echo "$(YELLOW)[WARN]$(NC) 发现 tsx 遗留进程，正在清理..."; \
		echo $$tsx_pids | xargs kill -9 2>/dev/null || true; \
		echo "$(GREEN)[OK]$(NC) 已清理 tsx 进程"; \
	fi
	@node_pids=$$(pgrep -f "node.*web/server" 2>/dev/null); \
	if [ -n "$$node_pids" ]; then \
		echo "$(YELLOW)[WARN]$(NC) 发现 node 遗留进程，正在清理..."; \
		echo $$node_pids | xargs kill -9 2>/dev/null || true; \
		echo "$(GREEN)[OK]$(NC) 已清理 node 进程"; \
	fi
	@echo "$(GREEN)[OK]$(NC) 历史进程清理完成"
	@echo ""
endif

# 启动服务（前台运行）
ifeq ($(IS_WINDOWS),1)
start: check-deps check-build kill-existing
	@echo "[INFO] 启动服务..."
	@echo "[INFO] 访问地址: http://localhost:$(PORT)"
	@echo "[WARN] 按 Ctrl+C 停止服务"
	@echo.
	@set PORT=$(PORT) && npm run web
else
start: check-deps check-build kill-existing
	@echo "$(BLUE)[INFO]$(NC) 启动服务..."
	@echo "$(BLUE)[INFO]$(NC) 访问地址: http://localhost:$(PORT)"
	@echo "$(YELLOW)[WARN]$(NC) 按 Ctrl+C 停止服务"
	@echo ""
	@PORT=$(PORT) npm run web
endif

# 后台启动服务
ifeq ($(IS_WINDOWS),1)
daemon: check-deps check-build kill-existing
	@echo "[INFO] 后台启动服务..."
	@start /B cmd /C "set PORT=$(PORT) && npm run web > $(LOG_FILE) 2>&1"
	@powershell -Command "(Get-NetTCPConnection -LocalPort $(PORT) -ErrorAction SilentlyContinue).OwningProcess | Out-File -FilePath $(PID_FILE)"
	@echo "[INFO] 等待服务启动..."
	@powershell -Command "$$success=$$false; for ($$i=1; $$i -le 10; $$i++) { Start-Sleep 1; try { Invoke-WebRequest -Uri 'http://localhost:$(PORT)/api/status' -UseBasicParsing -ErrorAction Stop | Out-Null; Write-Host '[OK] 服务启动成功!' -ForegroundColor Green; Write-Host '[INFO] 访问: http://localhost:$(PORT)'; Write-Host '[INFO] 日志: type $(LOG_FILE)'; $$success=$$true; break; } catch {} } if (-not $$success) { Write-Host '[ERROR] 启动超时' -ForegroundColor Red; exit 1 }"
else
daemon: check-deps check-build kill-existing
	@echo "$(BLUE)[INFO]$(NC) 后台启动服务..."
	@PORT=$(PORT) nohup npm run web > $(LOG_FILE) 2>&1 &
	@echo $$! > $(PID_FILE)
	@echo "$(BLUE)[INFO]$(NC) 等待服务启动..."
	@i=0; while [ $$i -lt 10 ]; do \
		i=$$((i + 1)); \
		sleep 1; \
		if curl -s "http://localhost:$(PORT)/api/status" >$(NULL) 2>&1; then \
			echo "$(GREEN)[OK]$(NC) 服务启动成功!"; \
			echo "$(BLUE)[INFO]$(NC) 访问: http://localhost:$(PORT)"; \
			echo "$(BLUE)[INFO]$(NC) 日志: tail -f $(LOG_FILE)"; \
			exit 0; \
		fi; \
		if ! ps -p $$(cat $(PID_FILE) 2>/dev/null) >$(NULL) 2>&1; then \
			echo "$(RED)[ERROR]$(NC) 启动失败，查看日志: tail -f $(LOG_FILE)"; \
			$(RM) $(PID_FILE); \
			exit 1; \
		fi; \
	done; \
	echo "$(RED)[ERROR]$(NC) 启动超时"; \
	exit 1
endif

# 停止服务
ifeq ($(IS_WINDOWS),1)
stop:
	@if not exist "$(PID_FILE)" ( \
		echo "[WARN] 服务未运行" && \
		exit /B 0 \
	)
	@powershell -Command "\
		$$pid = Get-Content $(PID_FILE); \
		$$proc = Get-Process -Id $$pid -ErrorAction SilentlyContinue; \
		if ($$proc) { \
			Write-Host \"'[INFO] 正在停止服务...'\"; \
			Stop-Process -Id $$pid -Force; \
			Write-Host '[OK] 服务已停止' -ForegroundColor Green; \
		} else { \
			Write-Host '[WARN] 服务未运行' -ForegroundColor Yellow; \
		} \
	"
	@$(RM) $(PID_FILE) 2>$(NULL) || (exit 0)
else
stop:
	@if [ ! -f "$(PID_FILE)" ]; then \
		echo "$(YELLOW)[WARN]$(NC) 服务未运行"; \
		exit 0; \
	fi
	@pid=$$(cat $(PID_FILE)); \
	if ps -p $$pid >$(NULL) 2>&1; then \
		echo "$(BLUE)[INFO]$(NC) 正在停止服务 (PID: $$pid)..."; \
		kill $$pid 2>/dev/null || true; \
		sleep 1; \
		if ps -p $$pid >$(NULL) 2>&1; then \
			kill -9 $$pid 2>/dev/null || true; \
		fi; \
		echo "$(GREEN)[OK]$(NC) 服务已停止"; \
	else \
		echo "$(YELLOW)[WARN]$(NC) 服务未运行"; \
	fi; \
	$(RM) $(PID_FILE)
endif

# 重启服务
ifeq ($(IS_WINDOWS),1)
restart:
	@$(MAKE) /$(MAKEFLAGS) stop
	@powershell -Command "Start-Sleep 1"
	@$(MAKE) /$(MAKEFLAGS) daemon
else
restart:
	@$(MAKE) stop
	@sleep 1
	@$(MAKE) daemon
endif

# 查看服务状态
ifeq ($(IS_WINDOWS),1)
status:
	@powershell -Command "\
		if (Test-Path $(PID_FILE)) { \
			$$pid = Get-Content $(PID_FILE); \
			$$proc = Get-Process -Id $$pid -ErrorAction SilentlyContinue; \
			if ($$proc) { \
				Write-Host \"'[OK] 服务运行中'\" -ForegroundColor Green; \
				Write-Host \"'[INFO] 访问: http://localhost:$(PORT)'\"; \
				try { \
					$$response = Invoke-WebRequest -Uri 'http://localhost:$(PORT)/api/status' -UseBasicParsing -ErrorAction Stop; \
					Write-Host '[OK] 服务响应正常' -ForegroundColor Green; \
				} catch { \
					Write-Host '[WARN] 服务可能未完全启动' -ForegroundColor Yellow; \
				} \
			} else { \
				Write-Host '[ERROR] 服务未运行' -ForegroundColor Red; \
				Remove-Item $(PID_FILE) -Force; \
			} \
		} else { \
			Write-Host '[WARN] 服务未运行' -ForegroundColor Yellow; \
		} \
	"
else
status:
	@if [ -f "$(PID_FILE)" ]; then \
		pid=$$(cat $(PID_FILE)); \
		if ps -p $$pid >$(NULL) 2>&1; then \
			echo "$(GREEN)[OK]$(NC) 服务运行中 (PID: $$pid)"; \
			echo "$(BLUE)[INFO]$(NC) 访问: http://localhost:$(PORT)"; \
			if curl -s "http://localhost:$(PORT)/api/status" >$(NULL) 2>&1; then \
				echo "$(GREEN)[OK]$(NC) 服务响应正常"; \
			else \
				echo "$(YELLOW)[WARN]$(NC) 服务可能未完全启动"; \
			fi; \
		else \
			echo "$(RED)[ERROR]$(NC) 服务未运行 (PID 文件残留)"; \
			$(RM) $(PID_FILE); \
		fi; \
	else \
		echo "$(YELLOW)[WARN]$(NC) 服务未运行"; \
	fi
endif

# 查看日志
ifeq ($(IS_WINDOWS),1)
logs:
	@if exist "$(LOG_FILE)" ( \
		type $(LOG_FILE) \
	) else ( \
		echo "[ERROR] 日志文件不存在: $(LOG_FILE)" \
	)
else
logs:
	@if [ -f "$(LOG_FILE)" ]; then \
		tail -f $(LOG_FILE); \
	else \
		echo "$(RED)[ERROR]$(NC) 日志文件不存在: $(LOG_FILE)"; \
	fi
endif

# 开发模式（热重载）
ifeq ($(IS_WINDOWS),1)
dev: check-deps kill-existing
	@echo "[INFO] 启动开发模式（热重载）..."
	@echo "[WARN] 按 Ctrl+C 停止"
	@echo.
	@npx tsx watch web/server.ts
else
dev: check-deps kill-existing
	@echo "$(BLUE)[INFO]$(NC) 启动开发模式（热重载）..."
	@echo "$(YELLOW)[WARN]$(NC) 按 Ctrl+C 停止"
	@echo ""
	@npx tsx watch web/server.ts
endif

# 清理编译输出和日志
ifeq ($(IS_WINDOWS),1)
clean:
	@echo "[INFO] 清理编译输出..."
	@if exist "dist" $(RMDIR) dist 2>$(NULL) || (exit 0)
	@$(RM) $(LOG_FILE) 2>$(NULL) || (exit 0)
	@$(RM) $(PID_FILE) 2>$(NULL) || (exit 0)
	@echo "[OK] 清理完成"
else
clean:
	@echo "$(BLUE)[INFO]$(NC) 清理编译输出..."
	@$(RMDIR) dist 2>/dev/null || true
	@$(RM) $(LOG_FILE) 2>/dev/null || true
	@$(RM) $(PID_FILE) 2>/dev/null || true
	@echo "$(GREEN)[OK]$(NC) 清理完成"
endif

# 运行测试
ifeq ($(IS_WINDOWS),1)
test: check-deps
	@echo "[INFO] 运行测试..."
	@npm test
else
test: check-deps
	@echo "$(BLUE)[INFO]$(NC) 运行测试..."
	@npm test
endif

# Docker 风格快捷命令
up: daemon
down: stop
