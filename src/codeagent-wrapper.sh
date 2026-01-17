#!/bin/bash
# codeagent-wrapper - 跨平台多模型调用脚本
# 用于 CCG-ROS2-Workflow

set -e

BACKEND=""
LITE=""
RESUME_ID=""
WORKDIR="$(pwd)"
LOG_DIR="/tmp/ccg-wrapper"

# 解析参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --lite)
      LITE="true"
      shift
      ;;
    --backend)
      BACKEND="$2"
      shift 2
      ;;
    resume)
      RESUME_ID="$2"
      shift 2
      ;;
    -)
      WORKDIR="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# 创建日志目录
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/wrapper-$$.log"

# 读取 stdin
PROMPT=$(cat)

# 记录日志
echo "[$(date)] Backend: $BACKEND, Resume: $RESUME_ID, Workdir: $WORKDIR" >> "$LOG_FILE"

# 切换工作目录
cd "$WORKDIR" 2>/dev/null || cd "$HOME"

# 生成 SESSION_ID
SESSION_ID="${RESUME_ID:-$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "sess-$$-$(date +%s)")}"

# 调用对应的后端
case "$BACKEND" in
  codex)
    # Codex CLI 调用
    if command -v codex &> /dev/null; then
      echo "$PROMPT" | codex -a auto -q 2>> "$LOG_FILE"
    else
      echo "[ERROR] codex CLI 未安装" >&2
      echo "请安装: npm install -g @openai/codex-cli" >&2
      exit 1
    fi
    ;;
  gemini)
    # Gemini CLI 调用
    if command -v gemini &> /dev/null; then
      echo "$PROMPT" | gemini -p - 2>> "$LOG_FILE"
    else
      echo "[ERROR] gemini CLI 未安装" >&2
      echo "请安装: npm install -g @google/gemini-cli" >&2
      exit 1
    fi
    ;;
  *)
    echo "[ERROR] 未知的后端: $BACKEND" >&2
    echo "支持的后端: codex, gemini" >&2
    exit 1
    ;;
esac

# 输出 SESSION_ID
echo ""
echo "---"
echo "SESSION_ID: $SESSION_ID"
