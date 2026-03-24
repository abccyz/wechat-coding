# WeChat Coding - 微信 AI 编程助手服务管理 Makefile
# 提供前后端服务的统一管理

.PHONY: help start stop restart status logs build clean dev test

# 默认配置
PORT ?= 3000
PID_FILE := .server.pid
LOG_FILE := server.log
SCRIPT_DIR := $(shell pwd)

# 颜色定义
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m

# 帮助信息
help:
	@echo "WeChat Coding - 微信 AI 编程助手服务管理"
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

# 默认显示帮助
.DEFAULT_GOAL := help

# 检查依赖
check-deps:
	@command -v node >/dev/null 2>&1 || { echo "$(RED)[ERROR]$(NC) 未找到 Node.js，请先安装 Node.js >= 18"; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "$(RED)[ERROR]$(NC) 未找到 npm"; exit 1; }
	@if [ ! -d "node_modules" ]; then \
		echo "$(YELLOW)[WARN]$(NC) 未找到 node_modules，正在安装依赖..."; \
		npm install; \
		echo "$(GREEN)[OK]$(NC) 依赖安装完成"; \
	fi

# 检查是否需要编译
check-build:
	@if [ ! -d "dist" ]; then \
		echo "$(YELLOW)[WARN]$(NC) 未找到 dist 目录，正在编译..."; \
		$(MAKE) build; \
	fi

# 编译项目
build: check-deps
	@echo "$(BLUE)[INFO]$(NC) 正在编译 TypeScript..."
	@npm run build
	@echo "$(GREEN)[OK]$(NC) 编译完成"

# 清理历史进程
kill-existing:
	@echo "$(BLUE)[INFO]$(NC) 检查并清理历史进程..."
	@# 1. 从 PID 文件停止旧进程
	@if [ -f "$(PID_FILE)" ]; then \
		pid=$$(cat $(PID_FILE) 2>/dev/null); \
		if [ -n "$$pid" ] && ps -p $$pid > /dev/null 2>&1; then \
			echo "$(YELLOW)[WARN]$(NC) 发现遗留进程 (PID: $$pid)，正在停止..."; \
			kill $$pid 2>/dev/null || true; \
			sleep 1; \
			if ps -p $$pid > /dev/null 2>&1; then \
				kill -9 $$pid 2>/dev/null || true; \
			fi; \
			echo "$(GREEN)[OK]$(NC) 已停止遗留进程"; \
		fi; \
		rm -f $(PID_FILE); \
	fi
	@# 2. 检查并结束占用端口的进程
	@port_pid=$$(lsof -ti:$(PORT) 2>/dev/null); \
	if [ -n "$$port_pid" ]; then \
		echo "$(YELLOW)[WARN]$(NC) 端口 $(PORT) 被占用 (PID: $$port_pid)，正在释放..."; \
		kill -9 $$port_pid 2>/dev/null || true; \
		sleep 1; \
		echo "$(GREEN)[OK]$(NC) 已释放端口 $(PORT)"; \
	fi
	@# 3. 清理其他可能的遗留进程
	@tsx_pids=$$(pgrep -f "tsx.*web/server" 2>/dev/null); \
	if [ -n "$$tsx_pids" ]; then \
		echo "$(YELLOW)[WARN]$(NC) 发现 tsx 遗留进程，正在清理..."; \
		echo $$tsx_pids | xargs kill -9 2>/dev/null || true; \
		echo "$(GREEN)[OK]$(NC) 已清理 tsx 进程"; \
	fi
	@# 4. 清理 node 进程（仅本项目相关的）
	@node_pids=$$(pgrep -f "node.*web/server" 2>/dev/null); \
	if [ -n "$$node_pids" ]; then \
		echo "$(YELLOW)[WARN]$(NC) 发现 node 遗留进程，正在清理..."; \
		echo $$node_pids | xargs kill -9 2>/dev/null || true; \
		echo "$(GREEN)[OK]$(NC) 已清理 node 进程"; \
	fi
	@echo "$(GREEN)[OK]$(NC) 历史进程清理完成"
	@echo ""

# 启动服务（前台运行）
start: check-deps check-build kill-existing
	@echo "$(BLUE)[INFO]$(NC) 启动服务..."
	@echo "$(BLUE)[INFO]$(NC) 访问地址: http://localhost:$(PORT)"
	@echo "$(YELLOW)[WARN]$(NC) 按 Ctrl+C 停止服务"
	@echo ""
	@PORT=$(PORT) npm run web

# 后台启动服务
daemon: check-deps check-build kill-existing
	@echo "$(BLUE)[INFO]$(NC) 后台启动服务..."
	@PORT=$(PORT) nohup npm run web > $(LOG_FILE) 2>&1 &
	@echo $$! > $(PID_FILE)
	@echo "$(BLUE)[INFO]$(NC) 等待服务启动..."
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		sleep 1; \
		if curl -s "http://localhost:$(PORT)/api/status" > /dev/null 2>&1; then \
			echo "$(GREEN)[OK]$(NC) 服务启动成功!"; \
			echo "$(BLUE)[INFO]$(NC) 访问: http://localhost:$(PORT)"; \
			echo "$(BLUE)[INFO]$(NC) 日志: tail -f $(LOG_FILE)"; \
			exit 0; \
		fi; \
		if ! ps -p $$(cat $(PID_FILE) 2>/dev/null) > /dev/null 2>&1; then \
			echo "$(RED)[ERROR]$(NC) 启动失败，查看日志: tail -f $(LOG_FILE)"; \
			rm -f $(PID_FILE); \
			exit 1; \
		fi; \
	done
	@echo "$(RED)[ERROR]$(NC) 启动超时"

# 停止服务
stop:
	@if [ ! -f "$(PID_FILE)" ]; then \
		echo "$(YELLOW)[WARN]$(NC) 服务未运行"; \
		exit 0; \
	fi
	@pid=$$(cat $(PID_FILE)); \
	if ps -p $$pid > /dev/null 2>&1; then \
		echo "$(BLUE)[INFO]$(NC) 正在停止服务 (PID: $$pid)..."; \
		kill $$pid 2>/dev/null || true; \
		sleep 1; \
		if ps -p $$pid > /dev/null 2>&1; then \
			kill -9 $$pid 2>/dev/null || true; \
		fi; \
		echo "$(GREEN)[OK]$(NC) 服务已停止"; \
	else \
		echo "$(YELLOW)[WARN]$(NC) 服务未运行"; \
	fi; \
	rm -f $(PID_FILE)

# 重启服务
restart:
	@$(MAKE) stop
	@sleep 1
	@$(MAKE) daemon

# 查看服务状态
status:
	@if [ -f "$(PID_FILE)" ]; then \
		pid=$$(cat $(PID_FILE)); \
		if ps -p $$pid > /dev/null 2>&1; then \
			echo "$(GREEN)[OK]$(NC) 服务运行中 (PID: $$pid)"; \
			echo "$(BLUE)[INFO]$(NC) 访问: http://localhost:$(PORT)"; \
			if curl -s "http://localhost:$(PORT)/api/status" > /dev/null 2>&1; then \
				echo "$(GREEN)[OK]$(NC) 服务响应正常"; \
			else \
				echo "$(YELLOW)[WARN]$(NC) 服务可能未完全启动"; \
			fi; \
		else \
			echo "$(RED)[ERROR]$(NC) 服务未运行 (PID 文件残留)"; \
			rm -f $(PID_FILE); \
		fi; \
	else \
		echo "$(YELLOW)[WARN]$(NC) 服务未运行"; \
	fi

# 查看日志
logs:
	@if [ -f "$(LOG_FILE)" ]; then \
		tail -f $(LOG_FILE); \
	else \
		echo "$(RED)[ERROR]$(NC) 日志文件不存在: $(LOG_FILE)"; \
	fi

# 开发模式（热重载）
dev: check-deps kill-existing
	@echo "$(BLUE)[INFO]$(NC) 启动开发模式（热重载）..."
	@echo "$(YELLOW)[WARN]$(NC) 按 Ctrl+C 停止"
	@echo ""
	@npx tsx watch web/server.ts

# 清理编译输出和日志
clean:
	@echo "$(BLUE)[INFO]$(NC) 清理编译输出..."
	@rm -rf dist
	@rm -f $(LOG_FILE) nohup.out
	@rm -f .server.pid .dev.pid
	@echo "$(GREEN)[OK]$(NC) 清理完成"

# 运行测试
test: check-deps
	@echo "$(BLUE)[INFO]$(NC) 运行测试..."
	@npm test

# Docker 风格快捷命令
up: daemon
down: stop
