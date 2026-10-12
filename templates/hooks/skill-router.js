#!/usr/bin/env node
// CCG Skill Router Hook — UserPromptSubmit
// Detects domain keywords in user message and injects relevant skill content.
// Fires alongside workflow-state.js on every user prompt.

'use strict';

try {
  const fs = require('fs');
  const path = require('path');
  const { outputHook } = require('./task-utils.js');
  const routing = JSON.parse("{{HOOK_CONFIG_JSON}}");

  // Read hook input (contains user's message)
  let inputData = '';
  if (!process.stdin.isTTY) {
    inputData = fs.readFileSync(0, 'utf-8');
  }

  // Extract user message from hook input
  let userMessage = '';
  try {
    const parsed = JSON.parse(inputData);
    userMessage = parsed.message || parsed.content || parsed.prompt || '';
    if (typeof userMessage === 'object') userMessage = JSON.stringify(userMessage);
  } catch {
    userMessage = inputData;
  }

  if (!userMessage || userMessage.length < 5) process.exit(0);

  const msgLower = userMessage.toLowerCase();

  // Keyword → skill file routing table
  const ROUTES = [
    { keywords: ['渗透', '红队', 'pentest', 'exploit', 'c2', '横向', '提权', 'bypass', 'red team'], skill: 'domains/security/red-team.md', name: '红队渗透' },
    { keywords: ['蓝队', '告警', 'ioc', '应急', '取证', 'siem', 'edr', 'blue team', 'incident'], skill: 'domains/security/blue-team.md', name: '蓝队防御' },
    { keywords: ['sqli', 'xss', 'ssrf', 'rce', 'injection', 'owasp', 'web渗透', 'api安全'], skill: 'domains/security/pentest.md', name: 'Web渗透' },
    { keywords: ['代码审计', '污点分析', 'sink', 'source', '危险函数', 'code audit'], skill: 'domains/security/code-audit.md', name: '代码审计' },
    { keywords: ['逆向', 'pwn', 'fuzzing', '栈溢出', '堆溢出', 'rop', 'binary', 'reversing'], skill: 'domains/security/vuln-research.md', name: '漏洞研究' },
    { keywords: ['osint', '威胁情报', '威胁建模', 'att&ck', 'threat', 'threat hunting'], skill: 'domains/security/threat-intel.md', name: '威胁情报' },
    { keywords: ['api设计', 'rest', 'graphql', 'grpc', 'endpoint', 'versioning', 'api design'], skill: 'domains/architecture/api-design.md', name: 'API设计' },
    { keywords: ['缓存', 'redis', 'memcached', 'cache', 'cdn', 'invalidation'], skill: 'domains/architecture/caching.md', name: '缓存架构' },
    { keywords: ['kubernetes', 'docker', 'k8s', '微服务', 'service mesh', 'cloud native'], skill: 'domains/architecture/cloud-native.md', name: '云原生' },
    { keywords: ['kafka', 'rabbitmq', '消息队列', 'event driven', 'pub/sub', 'message queue'], skill: 'domains/architecture/message-queue.md', name: '消息队列' },
    { keywords: ['rag', 'retrieval', '向量', 'embedding', 'chunking', 'vector'], skill: 'domains/ai/rag-system.md', name: 'RAG系统' },
    { keywords: ['ai agent', 'tool use', 'function calling', 'agent框架', 'orchestration'], skill: 'domains/ai/agent-dev.md', name: 'Agent开发' },
    { keywords: ['prompt injection', 'jailbreak', 'guardrail', 'llm安全'], skill: 'domains/ai/llm-security.md', name: 'LLM安全' },
  ];

  // Find matching skills
  const matched = ROUTES.filter(route =>
    route.keywords.some(kw => msgLower.includes(kw))
  );

  // ── Model action triggers ──
  // Detect when user wants to use a specific model for a task
  const MODEL_ACTIONS = [
    { keywords: ['codex审查', 'codex 审查', 'codex review', '用codex看', '让codex检查', 'codex检查'], model: 'codex', role: 'reviewer', action: '审查当前代码变更（git diff）' },
    { keywords: ['codex分析', 'codex 分析', 'codex analyze', '用codex分析'], model: 'codex', role: 'analyzer', action: '分析当前项目/代码' },
    { keywords: ['codex调试', 'codex 调试', 'codex debug', '用codex调试'], model: 'codex', role: 'debugger', action: '诊断问题' },
    { keywords: ['codex测试', 'codex 测试', 'codex test', '用codex写测试'], model: 'codex', role: 'tester', action: '生成测试用例' },
    { keywords: ['gemini审查', 'gemini 审查', 'gemini review', '用gemini看', '让gemini检查'], model: 'gemini', role: 'reviewer', action: '审查当前代码变更（git diff）' },
    { keywords: ['gemini分析', 'gemini 分析', 'gemini analyze', '用gemini分析'], model: 'gemini', role: 'analyzer', action: '分析当前项目/代码' },
    { keywords: ['gemini前端', 'gemini 前端', '用gemini做前端'], model: 'gemini', role: 'frontend', action: '前端开发分析' },
    { keywords: ['双模型审查', '双模型 审查', '两个模型审查', 'dual review'], model: 'both', role: 'reviewer', action: '双模型交叉审查代码变更' },
    { keywords: ['双模型分析', '双模型 分析', '两个模型分析', 'dual analyze'], model: 'both', role: 'analyzer', action: '双模型并行分析' },
  ];

  const modelAction = MODEL_ACTIONS.find(a => a.keywords.some(kw => msgLower.includes(kw)));
  if (modelAction) {
    const installDir = routing.installDir;
    const wrapperPath = path.join(installDir, 'bin', process.platform === 'win32' ? 'codeagent-wrapper.exe' : 'codeagent-wrapper');
    const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
    const modelFlags = backend => {
      const flag = { gemini: '--gemini-model', grok: '--grok-model', kimi: '--kimi-model', opencode: '--opencode-model' }[backend];
      return flag && routing.models[backend] ? ' ' + flag + ' ' + quote(routing.models[backend]) : '';
    };
    const invocation = backend => `${quote(wrapperPath)} --progress${routing.liteMode ? ' --lite' : ''} --backend ${backend}${modelFlags(backend)} - "$WORKDIR" <<'EOF'
ROLE_FILE: ${path.join(installDir, '.ccg', 'prompts', backend, modelAction.role + '.md')}
<TASK>${modelAction.action}</TASK>
EOF`;
    const selected = modelAction.model === 'both'
      ? [...new Set([routing.backend, routing.frontend])]
      : [modelAction.model];
    let actionInstructions;
    if (selected.length === 1 && selected[0] === 'claude') {
      actionInstructions = `<ccg-model-action>
使用 Claude Code 原生 Agent 执行${modelAction.action}，先读取 ${path.join(installDir, '.ccg', 'prompts', 'claude', modelAction.role + '.md')}。
当前配置只有 Claude 模型；可使用独立角色意见，但不得声称双模型交叉验证，不启动递归 Claude CLI。
</ccg-model-action>`;
    } else {
      actionInstructions = `<ccg-model-action>
用户请求${modelAction.action}。按实际配置执行 ${selected.length} 个独立后端：${selected.join(', ')}。

1. 获取工作目录: WORKDIR=$(pwd)
2. ${selected.length > 1 ? '并行调用以下后端 (run_in_background: true)' : '调用以下后端'}：

${selected.map(invocation).join('\n\n')}

3. 等待结果并输出；相同后端只调用一次，不把单模型说成双模型。
</ccg-model-action>`;
    }

    outputHook('UserPromptSubmit', actionInstructions);
    process.exit(0);
  }

  // ── Domain knowledge injection ──
  if (routing.nativeSkills) process.exit(0);
  if (matched.length === 0) process.exit(0);

  const skillsBase = path.join(routing.installDir, 'skills', 'ccg');

  if (!fs.existsSync(skillsBase)) process.exit(0);

  const injections = [];
  const maxContextChars = 8000;
  for (const match of matched.slice(0, 2)) {
    const skillPath = path.join(skillsBase, match.skill);
    if (!fs.existsSync(skillPath)) continue;

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const lines = content.split('\n');
      const excerpt = lines.slice(0, 120).join('\n');
      injections.push(`## ${match.name} (auto-injected)\n${excerpt}${lines.length > 120 ? '\n...(truncated, full: ' + match.skill + ')' : ''}`);
    } catch { /* silent */ }
  }

  if (injections.length === 0) process.exit(0);

  const body = injections.join('\n\n---\n\n').slice(0, maxContextChars);
  const context = `<ccg-domain-knowledge>\n${body}\n</ccg-domain-knowledge>`;
  outputHook('UserPromptSubmit', context);
} catch {
  process.exit(0);
}
