#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 延迟加载依赖，避免首次运行时报错
let inquirer, chalk;
async function loadDependencies() {
  try {
    inquirer = require('inquirer');
    chalk = require('chalk');
  } catch {
    console.log('正在安装依赖...');
    execSync('npm install inquirer@8.2.6 chalk@4.1.2', { stdio: 'inherit' });
    inquirer = require('inquirer');
    chalk = require('chalk');
  }
}

// 路径常量
const CLAUDE_DIR = path.join(process.env.HOME, '.claude');
const CCG_DIR = path.join(CLAUDE_DIR, '.ccg');
const COMMANDS_DIR = path.join(CLAUDE_DIR, 'commands', 'ccg');
const AGENTS_DIR = path.join(CLAUDE_DIR, 'agents', 'ccg');
const BIN_DIR = path.join(CLAUDE_DIR, 'bin');
const MCP_CONFIG_PATH = path.join(CLAUDE_DIR, 'mcp_servers.json');
const SRC_DIR = path.join(__dirname, '..', 'src');
const PACKAGE_NAME = 'ccg-ros2-workflow';

// 版本信息
const PACKAGE_JSON = require('../package.json');
const VERSION = PACKAGE_JSON.version;

// ==================== 工具函数 ====================

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;

  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(child => {
      copyRecursive(path.join(src, child), path.join(dest, child));
    });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [search, replace] of Object.entries(replacements)) {
    content = content.replace(new RegExp(search, 'g'), replace);
  }
  fs.writeFileSync(filePath, content);
}

function isInstalled() {
  return fs.existsSync(path.join(CCG_DIR, 'config.toml')) ||
         fs.existsSync(COMMANDS_DIR);
}

function getInstalledVersion() {
  const configPath = path.join(CCG_DIR, 'config.toml');
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/version\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  }
  return null;
}

async function checkLatestVersion() {
  try {
    const result = execSync(`npm view ${PACKAGE_NAME} version`, { encoding: 'utf8', timeout: 10000 });
    return result.trim();
  } catch {
    return null;
  }
}

function countFiles(dir, ext = '.md') {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => f.endsWith(ext)).length;
}

// ==================== 主菜单 ====================

async function showMainMenu() {
  console.log('\n' + chalk.cyan.bold('🤖 CCG-ROS2-Workflow'));
  console.log(chalk.gray('━'.repeat(40)));
  console.log(chalk.white('ROS2 多模型协作开发工具'));
  console.log(chalk.gray(`Codex (底层控制) + Gemini (上层集成) + Claude (编排)`));
  console.log(chalk.gray(`版本: ${VERSION}`));
  console.log(chalk.gray('━'.repeat(40)) + '\n');

  // 检查安装状态
  const installed = isInstalled();
  const installedVersion = getInstalledVersion();

  if (installed) {
    console.log(chalk.green(`✓ 已安装`) + (installedVersion ? chalk.gray(` (v${installedVersion})`) : ''));
  } else {
    console.log(chalk.yellow(`○ 未安装`));
  }
  console.log('');

  const choices = [
    { name: chalk.green('1.') + ' 安装/重装工作流', value: 'install' },
    { name: chalk.blue('2.') + ' 更新工作流', value: 'update' },
    { name: chalk.cyan('3.') + ' 配置 ace-tool MCP', value: 'mcp' },
    { name: chalk.magenta('4.') + ' 配置 API 密钥', value: 'api' },
    { name: chalk.yellow('5.') + ' 帮助', value: 'help' },
    { name: chalk.red('6.') + ' 卸载工作流', value: 'uninstall' },
    { name: chalk.gray('7.') + ' 退出', value: 'exit' },
  ];

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '请选择操作:',
      choices,
    }
  ]);

  switch (action) {
    case 'install':
      await install();
      break;
    case 'update':
      await update();
      break;
    case 'mcp':
      await configureMCP();
      break;
    case 'api':
      await configureApiKeys();
      break;
    case 'help':
      showHelp();
      break;
    case 'uninstall':
      await uninstall();
      break;
    case 'exit':
      console.log(chalk.gray('再见！'));
      process.exit(0);
  }

  // 返回主菜单
  await showMainMenu();
}

// ==================== 安装功能 ====================

async function install() {
  console.log('\n' + chalk.cyan.bold('📦 安装工作流'));
  console.log(chalk.gray('━'.repeat(40)) + '\n');

  // 检查是否已安装
  if (isInstalled()) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.yellow('检测到已有安装，是否覆盖？'),
        default: false
      }
    ]);
    if (!confirm) {
      console.log(chalk.gray('取消安装'));
      return;
    }
  }

  console.log(chalk.blue('→') + ' 创建目录结构...');
  [CCG_DIR, COMMANDS_DIR, AGENTS_DIR, BIN_DIR].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
  });

  console.log(chalk.blue('→') + ' 复制提示词文件...');
  copyRecursive(path.join(SRC_DIR, 'prompts'), path.join(CCG_DIR, 'prompts'));
  const promptCount = countFiles(path.join(CCG_DIR, 'prompts', 'codex')) +
                      countFiles(path.join(CCG_DIR, 'prompts', 'gemini')) +
                      countFiles(path.join(CCG_DIR, 'prompts', 'claude'));
  console.log(chalk.gray(`  已复制 ${promptCount} 个提示词文件`));

  console.log(chalk.blue('→') + ' 复制命令文件...');
  copyRecursive(path.join(SRC_DIR, 'commands', 'ccg'), COMMANDS_DIR);
  const commandCount = countFiles(COMMANDS_DIR);
  console.log(chalk.gray(`  已复制 ${commandCount} 个命令文件`));

  console.log(chalk.blue('→') + ' 创建 agents 目录...');
  // 创建 agents 文件
  createAgentFiles();
  const agentCount = countFiles(AGENTS_DIR);
  console.log(chalk.gray(`  已创建 ${agentCount} 个 agent 文件`));

  console.log(chalk.blue('→') + ' 复制配置文件...');
  const configSrc = path.join(SRC_DIR, 'config.toml');
  const configDest = path.join(CCG_DIR, 'config.toml');
  if (fs.existsSync(configSrc)) {
    let configContent = fs.readFileSync(configSrc, 'utf8');
    // 添加版本信息
    if (!configContent.includes('version')) {
      configContent = `version = "${VERSION}"\n` + configContent;
    }
    fs.writeFileSync(configDest, configContent);
  } else {
    // 创建默认配置
    fs.writeFileSync(configDest, `version = "${VERSION}"\nlanguage = "zh-CN"\n`);
  }

  console.log(chalk.blue('→') + ' 安装 codeagent-wrapper...');
  const wrapperSrc = path.join(SRC_DIR, 'codeagent-wrapper.sh');
  const wrapperDest = path.join(BIN_DIR, 'codeagent-wrapper');
  if (fs.existsSync(wrapperSrc)) {
    fs.copyFileSync(wrapperSrc, wrapperDest);
    fs.chmodSync(wrapperDest, '755');
  }

  console.log(chalk.blue('→') + ' 处理路径变量...');
  const homeDir = process.env.HOME;
  const filesToUpdate = [
    configDest,
    ...fs.readdirSync(COMMANDS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(COMMANDS_DIR, f))
  ];
  filesToUpdate.forEach(file => {
    replaceInFile(file, { '\\$HOME': homeDir });
  });

  console.log('\n' + chalk.green.bold('✅ 工作流安装完成！') + '\n');

  // 显示安装摘要
  console.log(chalk.white('安装摘要:'));
  console.log(chalk.gray(`  • 命令: ${commandCount} 个`));
  console.log(chalk.gray(`  • 提示词: ${promptCount} 个`));
  console.log(chalk.gray(`  • Agents: ${agentCount} 个`));
  console.log(chalk.gray(`  • 配置: ~/.claude/.ccg/config.toml`));
  console.log('');

  // 询问是否配置 MCP
  const { configMcp } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'configMcp',
      message: '是否配置 ace-tool MCP？' + chalk.gray('(推荐，提供代码上下文)'),
      default: true
    }
  ]);
  if (configMcp) {
    await configureMCP();
  }

  // 询问是否配置 API
  const { configApi } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'configApi',
      message: '是否配置 API 密钥？',
      default: false
    }
  ]);
  if (configApi) {
    await configureApiKeys();
  }

  console.log('\n' + chalk.cyan('📖 使用方法:'));
  console.log(chalk.white('  在 Claude Code 中使用 /ccg:workflow <任务描述>'));
  console.log(chalk.white('  查看所有命令: /ccg:<Tab>'));
  console.log('\n' + chalk.yellow('⚠️  请重启 Claude Code 使配置生效'));
}

// ==================== 创建 Agent 文件 ====================

function createAgentFiles() {
  const agents = {
    'system-integrator.md': `---
description: '系统集成设计师 - 为 ROS2 功能生成系统架构、节点交互和 Launch 配置设计'
---

# System Integrator - ROS2 系统集成设计

## 角色

你是 ROS2 系统集成设计师，负责设计上层应用架构。

## 职责

- 设计节点间通信架构
- 规划 Launch 文件结构
- 配置参数管理方案
- 设计 RViz 可视化配置

## 输出格式

\`\`\`markdown
## 系统集成设计

### 节点架构
### Launch 结构
### 参数配置
### 可视化配置
\`\`\`
`,
    'planner.md': `---
description: '任务规划师 - 使用 WBS 方法论分解功能需求为可执行任务'
---

# Planner - 任务规划

## 角色

你是任务规划师，使用 WBS 方法分解需求。

## 职责

- 分解功能需求为子任务
- 确定任务依赖关系
- 估算任务复杂度
- 生成实施计划

## 输出格式

\`\`\`markdown
## 实施计划

### 任务分解
### 依赖关系
### 优先级排序
### 验收标准
\`\`\`
`,
    'get-current-datetime.md': `---
description: '获取当前日期时间'
---

# Get Current Datetime

执行日期命令并返回当前时间。
`
  };

  for (const [filename, content] of Object.entries(agents)) {
    fs.writeFileSync(path.join(AGENTS_DIR, filename), content);
  }
}

// ==================== 更新功能 ====================

async function update() {
  console.log('\n' + chalk.blue.bold('🔄 检查更新'));
  console.log(chalk.gray('━'.repeat(40)) + '\n');

  if (!isInstalled()) {
    console.log(chalk.yellow('未检测到安装，请先安装工作流'));
    return;
  }

  const installedVersion = getInstalledVersion() || '未知';
  console.log(chalk.gray(`当前版本: v${installedVersion}`));
  console.log(chalk.gray(`包版本: v${VERSION}`));

  console.log(chalk.blue('→') + ' 检查 npm 最新版本...');
  const latestVersion = await checkLatestVersion();

  if (latestVersion) {
    console.log(chalk.gray(`最新版本: v${latestVersion}`));

    if (latestVersion !== VERSION) {
      console.log('\n' + chalk.yellow(`发现新版本 v${latestVersion}`));
      console.log(chalk.gray('运行以下命令更新:'));
      console.log(chalk.cyan(`  npx ${PACKAGE_NAME}@latest`));
      return;
    }
  }

  if (installedVersion === VERSION) {
    console.log('\n' + chalk.green('✓ 已是最新版本'));

    const { reinstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reinstall',
        message: '是否重新安装工作流文件？',
        default: false
      }
    ]);

    if (reinstall) {
      await install();
    }
  } else {
    console.log('\n' + chalk.blue('→') + ' 更新工作流文件...');
    await install();
  }
}

// ==================== MCP 配置 ====================

async function configureMCP() {
  console.log('\n' + chalk.cyan.bold('🔧 配置 ace-tool MCP'));
  console.log(chalk.gray('━'.repeat(40)));
  console.log(chalk.white('ace-tool 是 Augment Code 的代码上下文引擎'));
  console.log(chalk.gray('它能让 AI 自动理解你的项目结构和代码') + '\n');

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '请选择操作:',
      choices: [
        { name: chalk.green('安装/更新 ace-tool') + chalk.gray(' (Node.js 版本)'), value: 'ace-tool' },
        { name: chalk.green('安装/更新 ace-tool-rs') + chalk.gray(' (Rust 版本，推荐)'), value: 'ace-tool-rs' },
        { name: chalk.red('卸载 ace-tool MCP 配置'), value: 'uninstall' },
        { name: chalk.gray('返回'), value: 'back' },
      ]
    }
  ]);

  if (action === 'back') return;

  if (action === 'uninstall') {
    await uninstallMCP();
    return;
  }

  const pkg = action;
  const pkgName = pkg === 'ace-tool-rs' ? 'ace-tool-rs (Rust)' : 'ace-tool (Node.js)';

  console.log('\n' + chalk.blue(`📦 配置 ${pkgName}`) + '\n');

  console.log(chalk.white('获取 Token 的方式:'));
  console.log(chalk.gray('  • 官方服务: https://augmentcode.com/ 注册获取'));
  console.log(chalk.gray('  • 中转服务: 使用第三方中转（需要 Base URL）') + '\n');

  const { baseUrl, token } = await inquirer.prompt([
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Base URL' + chalk.gray(' (使用官方服务请留空):'),
      default: ''
    },
    {
      type: 'password',
      name: 'token',
      message: 'Token' + chalk.red(' (必填):'),
      mask: '*',
      validate: input => input.trim() ? true : 'Token 不能为空'
    }
  ]);

  // 构建 MCP 配置
  const args = [pkg, 'mcp'];
  if (baseUrl.trim()) {
    args.push('--base-url', baseUrl.trim());
  }
  args.push('--token', token.trim());

  const mcpServerConfig = {
    command: 'npx',
    args: args,
    env: pkg === 'ace-tool-rs' ? { RUST_LOG: 'info' } : {}
  };

  // 读取或创建 MCP 配置
  let mcpConfig = {};
  if (fs.existsSync(MCP_CONFIG_PATH)) {
    try {
      mcpConfig = JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf8'));

      // 备份现有配置
      const backupDir = path.join(CLAUDE_DIR, 'backup');
      fs.mkdirSync(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, `mcp_servers_${Date.now()}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(mcpConfig, null, 2));
      console.log(chalk.gray(`已备份配置到: ${backupPath}`));
    } catch {
      mcpConfig = {};
    }
  }

  // 添加 ace-tool 配置
  mcpConfig['ace-tool'] = mcpServerConfig;

  // 写入配置
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(mcpConfig, null, 2));

  console.log('\n' + chalk.green.bold('✅ MCP 配置已写入') + '\n');
  console.log(chalk.white('配置文件: ~/.claude/mcp_servers.json'));
  console.log(chalk.gray('配置内容:'));
  console.log(chalk.gray(JSON.stringify(mcpServerConfig, null, 2)));

  console.log('\n' + chalk.cyan('📌 说明:'));
  console.log(chalk.white(`  • 使用 npx ${pkg} 自动下载运行`));
  console.log(chalk.white('  • 首次运行会自动下载包'));
  console.log(chalk.white('  • 重启 Claude Code 使 MCP 生效'));
}

async function uninstallMCP() {
  if (!fs.existsSync(MCP_CONFIG_PATH)) {
    console.log(chalk.yellow('未找到 MCP 配置文件'));
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: chalk.red('确定要移除 ace-tool MCP 配置吗？'),
      default: false
    }
  ]);

  if (!confirm) {
    console.log(chalk.gray('取消卸载'));
    return;
  }

  try {
    let mcpConfig = JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf8'));

    if (!mcpConfig['ace-tool']) {
      console.log(chalk.yellow('MCP 配置中没有 ace-tool'));
      return;
    }

    delete mcpConfig['ace-tool'];

    if (Object.keys(mcpConfig).length === 0) {
      fs.unlinkSync(MCP_CONFIG_PATH);
      console.log(chalk.green('✅ 已删除: ~/.claude/mcp_servers.json'));
    } else {
      fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(mcpConfig, null, 2));
      console.log(chalk.green('✅ 已从 MCP 配置中移除 ace-tool'));
    }
  } catch (e) {
    console.log(chalk.red('❌ 移除失败:'), e.message);
  }
}

// ==================== API 密钥配置 ====================

async function configureApiKeys() {
  console.log('\n' + chalk.magenta.bold('🔑 配置 API 密钥'));
  console.log(chalk.gray('━'.repeat(40)) + '\n');

  const { geminiKey, geminiBaseUrl, codexKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'geminiKey',
      message: 'Gemini API Key' + chalk.gray(' (留空跳过):'),
      mask: '*'
    },
    {
      type: 'input',
      name: 'geminiBaseUrl',
      message: 'Gemini Base URL' + chalk.gray(' (留空使用官方):'),
      when: answers => answers.geminiKey
    },
    {
      type: 'password',
      name: 'codexKey',
      message: 'Codex API Key' + chalk.gray(' (留空跳过):'),
      mask: '*'
    }
  ]);

  // 检测 shell 配置文件
  const shellRc = fs.existsSync(path.join(process.env.HOME, '.zshrc'))
    ? '.zshrc'
    : '.bashrc';
  const rcPath = path.join(process.env.HOME, shellRc);

  let rcContent = fs.existsSync(rcPath) ? fs.readFileSync(rcPath, 'utf8') : '';

  // 添加环境变量
  const envVars = [];
  if (geminiKey) {
    envVars.push(`export GEMINI_API_KEY="${geminiKey}"`);
    envVars.push(`export GOOGLE_GEMINI_BASE_URL="${geminiBaseUrl || 'https://generativelanguage.googleapis.com'}"`);
    envVars.push('export GEMINI_MODEL="gemini-3-pro-preview"');
  }
  if (codexKey) {
    envVars.push(`export CODEX_API_KEY="${codexKey}"`);
    envVars.push(`export OPENAI_API_KEY="${codexKey}"`);
  }

  if (envVars.length > 0) {
    const marker = '# CCG-ROS2-Workflow';
    if (!rcContent.includes(marker)) {
      rcContent += `\n${marker}\n${envVars.join('\n')}\n`;
      fs.writeFileSync(rcPath, rcContent);
      console.log('\n' + chalk.green(`✅ 已添加到 ~/${shellRc}`));
      console.log(chalk.yellow(`   请运行: source ~/${shellRc}`));
    } else {
      console.log('\n' + chalk.yellow(`⚠️  ~/${shellRc} 中已存在配置，请手动更新`));
    }
  } else {
    console.log(chalk.gray('未配置任何密钥'));
  }
}

// ==================== 帮助 ====================

function showHelp() {
  console.log('\n' + chalk.yellow.bold('📖 帮助'));
  console.log(chalk.gray('━'.repeat(40)) + '\n');

  console.log(chalk.white.bold('可用命令:'));
  console.log(chalk.cyan('  /ccg:workflow') + chalk.gray(' - 完整 7 阶段开发工作流'));
  console.log(chalk.cyan('  /ccg:plan') + chalk.gray('     - 多模型协作规划'));
  console.log(chalk.cyan('  /ccg:execute') + chalk.gray('  - 执行实施计划'));
  console.log(chalk.cyan('  /ccg:feat') + chalk.gray('     - 智能功能开发'));
  console.log(chalk.cyan('  /ccg:frontend') + chalk.gray(' - 上层应用开发 (Gemini 主导)'));
  console.log(chalk.cyan('  /ccg:backend') + chalk.gray('  - 底层控制开发 (Codex 主导)'));
  console.log(chalk.cyan('  /ccg:analyze') + chalk.gray('  - 多模型技术分析'));
  console.log(chalk.cyan('  /ccg:review') + chalk.gray('   - 多模型代码审查'));
  console.log(chalk.cyan('  /ccg:test') + chalk.gray('     - 测试生成'));
  console.log(chalk.cyan('  /ccg:debug') + chalk.gray('    - 问题诊断'));
  console.log(chalk.cyan('  /ccg:optimize') + chalk.gray(' - 性能优化'));
  console.log(chalk.cyan('  /ccg:commit') + chalk.gray('   - 智能 Git 提交'));
  console.log(chalk.cyan('  /ccg:rollback') + chalk.gray(' - Git 回滚'));

  console.log('\n' + chalk.white.bold('智能路由:'));
  console.log(chalk.gray('  • 控制算法、C++、硬件驱动 → Codex'));
  console.log(chalk.gray('  • Launch、Python、RViz、配置 → Gemini'));

  console.log('\n' + chalk.white.bold('更多信息:'));
  console.log(chalk.gray('  https://github.com/GuYu-001/ccg-ros2-workflow'));
}

// ==================== 卸载功能 ====================

async function uninstall() {
  console.log('\n' + chalk.red.bold('🗑️  卸载工作流'));
  console.log(chalk.gray('━'.repeat(40)) + '\n');

  if (!isInstalled()) {
    console.log(chalk.yellow('未检测到安装'));
    return;
  }

  // 显示将要删除的内容
  console.log(chalk.white('将要删除:'));

  const commandCount = countFiles(COMMANDS_DIR);
  const agentCount = countFiles(AGENTS_DIR);
  const promptCount = fs.existsSync(path.join(CCG_DIR, 'prompts'))
    ? countFiles(path.join(CCG_DIR, 'prompts', 'codex')) +
      countFiles(path.join(CCG_DIR, 'prompts', 'gemini')) +
      countFiles(path.join(CCG_DIR, 'prompts', 'claude'))
    : 0;

  console.log(chalk.gray(`  • ${commandCount} 个命令文件`));
  console.log(chalk.gray(`  • ${agentCount} 个 agent 文件`));
  console.log(chalk.gray(`  • ${promptCount} 个提示词文件`));
  console.log(chalk.gray(`  • 配置文件`));
  console.log(chalk.gray(`  • codeagent-wrapper`));
  console.log('');

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: chalk.red('确定要卸载吗？这将删除所有配置文件'),
      default: false
    }
  ]);

  if (!confirm) {
    console.log(chalk.gray('取消卸载'));
    return;
  }

  // 删除目录
  const dirsToDelete = [CCG_DIR, COMMANDS_DIR, AGENTS_DIR];
  let deletedCount = 0;

  for (const dir of dirsToDelete) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
      console.log(chalk.gray(`已删除: ${dir}`));
      deletedCount++;
    }
  }

  // 删除 codeagent-wrapper
  const wrapperPath = path.join(BIN_DIR, 'codeagent-wrapper');
  if (fs.existsSync(wrapperPath)) {
    fs.unlinkSync(wrapperPath);
    console.log(chalk.gray(`已删除: ${wrapperPath}`));
    deletedCount++;
  }

  // 询问是否删除 MCP 配置
  if (fs.existsSync(MCP_CONFIG_PATH)) {
    const { removeMcp } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'removeMcp',
        message: '是否同时删除 ace-tool MCP 配置？',
        default: false
      }
    ]);

    if (removeMcp) {
      try {
        let mcpConfig = JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf8'));
        delete mcpConfig['ace-tool'];
        if (Object.keys(mcpConfig).length === 0) {
          fs.unlinkSync(MCP_CONFIG_PATH);
          console.log(chalk.gray('已删除: ~/.claude/mcp_servers.json'));
        } else {
          fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(mcpConfig, null, 2));
          console.log(chalk.gray('已从 MCP 配置中移除 ace-tool'));
        }
      } catch {
        // ignore
      }
    }
  }

  console.log('\n' + chalk.green.bold('✅ 卸载完成'));
  console.log(chalk.yellow('注意: 环境变量需要手动从 ~/.zshrc 或 ~/.bashrc 中删除'));
}

// ==================== 主程序 ====================

async function main() {
  await loadDependencies();
  await showMainMenu();
}

main().catch(err => {
  console.error(chalk.red('错误:'), err.message);
  process.exit(1);
});
