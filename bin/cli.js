#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 延迟加载依赖
let inquirer, chalk, ora;

async function loadDependencies() {
  try {
    inquirer = require('inquirer');
    chalk = require('chalk');
    ora = require('ora');
  } catch {
    console.log('正在安装依赖...');
    execSync('npm install inquirer@8.2.6 chalk@4.1.2 ora@5.4.1', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    inquirer = require('inquirer');
    chalk = require('chalk');
    ora = require('ora');
  }
}

// 路径常量
const CLAUDE_DIR = path.join(process.env.HOME, '.claude');
const CCG_DIR = path.join(CLAUDE_DIR, '.ccg');
const COMMANDS_DIR = path.join(CLAUDE_DIR, 'commands', 'ccg');
const AGENTS_DIR = path.join(CLAUDE_DIR, 'agents', 'ccg');
const BIN_DIR = path.join(CLAUDE_DIR, 'bin');
const CLAUDE_JSON_PATH = path.join(process.env.HOME, '.claude.json');
const SRC_DIR = path.join(__dirname, '..', 'src');
const PACKAGE_NAME = 'ccg-ros2-workflow';

// 版本信息
const PACKAGE_JSON = require('../package.json');
const VERSION = PACKAGE_JSON.version;

// 所有命令列表
const ALL_COMMANDS = [
  'workflow', 'plan', 'execute', 'feat',
  'frontend', 'backend',
  'analyze', 'review', 'test', 'debug', 'optimize',
  'init', 'enhance',
  'commit', 'rollback', 'clean-branches', 'worktree'
];

// ==================== 工具函数 ====================

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let count = 0;

  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(child => {
      count += copyRecursive(path.join(src, child), path.join(dest, child));
    });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    count = 1;
  }
  return count;
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

function countFiles(dir, ext = '.md') {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => f.endsWith(ext)).length;
}

function countFilesRecursive(dir, ext = '.md') {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      count += countFilesRecursive(fullPath, ext);
    } else if (item.endsWith(ext)) {
      count++;
    }
  }
  return count;
}

// ==================== 主菜单 ====================

async function showMainMenu() {
  while (true) {
    console.log();
    console.log(chalk.cyan.bold('  CCG-ROS2 - Claude + Codex + Gemini'));
    console.log(chalk.gray('  ROS2 多模型协作开发系统'));
    console.log();

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'CCG 主菜单',
      choices: [
        { name: `${chalk.green('➜')} 初始化 CCG 配置`, value: 'init' },
        { name: `${chalk.blue('➜')} 更新工作流`, value: 'update' },
        { name: `${chalk.cyan('⚙')} 配置 MCP`, value: 'config-mcp' },
        { name: `${chalk.yellow('?')} 帮助`, value: 'help' },
        new inquirer.Separator(),
        { name: `${chalk.magenta('➜')} 卸载工作流`, value: 'uninstall' },
        { name: `${chalk.red('✕')} 退出`, value: 'exit' },
      ],
    }]);

    switch (action) {
      case 'init':
        await init();
        break;
      case 'update':
        await update();
        break;
      case 'config-mcp':
        await configMcp();
        break;
      case 'help':
        showHelp();
        break;
      case 'uninstall':
        await uninstall();
        break;
      case 'exit':
        console.log(chalk.gray('Goodbye!'));
        return;
    }

    // 操作完成后暂停
    console.log();
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: chalk.gray('按 Enter 返回主菜单...'),
    }]);
  }
}

// ==================== 初始化/安装 ====================

async function init() {
  console.log();
  console.log(chalk.cyan.bold('  CCG - Claude + Codex + Gemini'));
  console.log(chalk.gray('  ROS2 多模型协作开发工作流'));
  console.log();

  // 固定配置
  const frontendModel = 'gemini';  // 上层应用：Launch、Python、配置
  const backendModel = 'codex';    // 底层控制：C++、硬件、实时

  // MCP 配置变量
  let mcpProvider = 'skip';
  let aceToolBaseUrl = '';
  let aceToolToken = '';

  // MCP 工具选择
  console.log();
  console.log(chalk.cyan.bold('  🔧 MCP 工具配置'));
  console.log();

  const { selectedMcp } = await inquirer.prompt([{
    type: 'list',
    name: 'selectedMcp',
    message: '选择 MCP 工具',
    choices: [
      {
        name: `ace-tool-rs ${chalk.green('(推荐)')} ${chalk.gray('(Rust 实现) - 更轻量、更快速')}`,
        value: 'ace-tool-rs',
      },
      {
        name: `ace-tool ${chalk.gray('(Node.js 实现) - 含 Prompt 增强 + 代码检索')}`,
        value: 'ace-tool',
      },
      {
        name: `跳过 ${chalk.gray('- 稍后手动配置')}`,
        value: 'skip',
      },
    ],
    default: 'ace-tool-rs',
  }]);

  mcpProvider = selectedMcp;

  // 配置 ace-tool
  if (selectedMcp === 'ace-tool' || selectedMcp === 'ace-tool-rs') {
    const toolName = selectedMcp === 'ace-tool-rs' ? 'ace-tool-rs' : 'ace-tool';
    const toolDesc = selectedMcp === 'ace-tool-rs'
      ? 'Rust 实现的 ace-tool，更轻量、更快速'
      : 'Node.js 实现，含 Prompt 增强 + 代码检索';

    console.log();
    console.log(chalk.cyan.bold(`  🔧 ${toolName} MCP 配置`));
    console.log(chalk.gray(`     ${toolDesc}`));
    console.log();

    const { skipToken } = await inquirer.prompt([{
      type: 'confirm',
      name: 'skipToken',
      message: '是否跳过 Token 配置？（可稍后运行 npx ccg-ros2-workflow 配置）',
      default: false,
    }]);

    if (!skipToken) {
      console.log();
      console.log(chalk.cyan('     📖 获取 ace-tool 访问方式：'));
      console.log();
      console.log(`     ${chalk.gray('•')} ${chalk.cyan('官方服务')}: ${chalk.underline('https://augmentcode.com/')}`);
      console.log(`       ${chalk.gray('注册账号后获取 Token')}`);
      console.log();
      console.log(`     ${chalk.gray('•')} ${chalk.cyan('中转服务')} ${chalk.yellow('(无需注册)')}: ${chalk.underline('https://linux.do/t/topic/1291730')}`);
      console.log(`       ${chalk.gray('linux.do 社区提供的免费中转服务')}`);
      console.log();

      const aceAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'baseUrl',
          message: `Base URL ${chalk.gray('(使用中转服务时必填，官方服务留空)')}`,
          default: '',
        },
        {
          type: 'password',
          name: 'token',
          message: `Token ${chalk.gray('(必填)')}`,
          mask: '*',
          validate: input => input.trim() !== '' || '请输入 Token',
        },
      ]);
      aceToolBaseUrl = aceAnswers.baseUrl || '';
      aceToolToken = aceAnswers.token || '';
    } else {
      console.log();
      console.log(chalk.yellow('  ℹ️  已跳过 Token 配置'));
      console.log(chalk.gray(`     • ace-tool MCP 将不会自动安装`));
      console.log(chalk.gray(`     • 可稍后运行 ${chalk.cyan('npx ccg-ros2-workflow')} 配置 Token`));
      console.log();
    }
  } else {
    console.log();
    console.log(chalk.yellow('  ℹ️  已跳过 MCP 配置'));
    console.log(chalk.gray('     • 可稍后手动配置任何 MCP 服务'));
    console.log();
  }

  // 显示配置摘要
  console.log();
  console.log(chalk.yellow('━'.repeat(50)));
  console.log(chalk.bold('  配置摘要:'));
  console.log();
  console.log(`  ${chalk.cyan('模型路由')}  ${chalk.blue('Codex')} (底层控制) + ${chalk.green('Gemini')} (上层应用)`);
  console.log(`  ${chalk.cyan('命令数量')}  ${chalk.yellow(ALL_COMMANDS.length.toString())} 个`);

  const mcpDisplay = (mcpProvider === 'ace-tool' || mcpProvider === 'ace-tool-rs')
    ? (aceToolToken ? chalk.green(mcpProvider) : chalk.yellow(`${mcpProvider} (待配置)`))
    : chalk.gray('跳过');
  console.log(`  ${chalk.cyan('MCP 工具')}  ${mcpDisplay}`);
  console.log(`  ${chalk.cyan('目标平台')}  ${chalk.white('ROS2 Humble 物理机器人')}`);
  console.log(chalk.yellow('━'.repeat(50)));
  console.log();

  // 确认安装
  const { confirmed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message: '确认安装以上配置？',
    default: true,
  }]);

  if (!confirmed) {
    console.log(chalk.yellow('安装已取消'));
    return;
  }

  // 开始安装
  const spinner = ora('正在安装...').start();

  try {
    // 创建目录
    spinner.text = '创建目录结构...';
    [CCG_DIR, COMMANDS_DIR, AGENTS_DIR, BIN_DIR].forEach(dir => {
      fs.mkdirSync(dir, { recursive: true });
    });

    // 复制命令文件
    spinner.text = '安装命令文件...';
    copyRecursive(path.join(SRC_DIR, 'commands', 'ccg'), COMMANDS_DIR);
    const commandCount = countFiles(COMMANDS_DIR);

    // 复制提示词文件
    spinner.text = '安装提示词文件...';
    copyRecursive(path.join(SRC_DIR, 'prompts'), path.join(CCG_DIR, 'prompts'));
    const promptCount = countFilesRecursive(path.join(CCG_DIR, 'prompts'));

    // 创建 agents
    spinner.text = '创建 agents...';
    createAgentFiles();
    const agentCount = countFiles(AGENTS_DIR);

    // 复制配置
    spinner.text = '写入配置...';
    const configContent = `version = "${VERSION}"
language = "zh-CN"
target = "ros2-humble"

[routing]
mode = "smart"
frontend = "gemini"
backend = "codex"
`;
    fs.writeFileSync(path.join(CCG_DIR, 'config.toml'), configContent);

    // 安装 codeagent-wrapper
    spinner.text = '安装 codeagent-wrapper...';
    const wrapperSrc = path.join(SRC_DIR, 'codeagent-wrapper.sh');
    const wrapperDest = path.join(BIN_DIR, 'codeagent-wrapper');
    if (fs.existsSync(wrapperSrc)) {
      fs.copyFileSync(wrapperSrc, wrapperDest);
      fs.chmodSync(wrapperDest, '755');
    }

    // 处理路径变量
    spinner.text = '处理路径变量...';
    const homeDir = process.env.HOME;
    const filesToUpdate = [
      path.join(CCG_DIR, 'config.toml'),
      ...fs.readdirSync(COMMANDS_DIR)
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(COMMANDS_DIR, f))
    ];
    filesToUpdate.forEach(file => {
      replaceInFile(file, { '\\$HOME': homeDir });
    });

    // 安装 ace-tool MCP（如果配置了 token）
    if ((mcpProvider === 'ace-tool' || mcpProvider === 'ace-tool-rs') && aceToolToken) {
      spinner.text = `配置 ${mcpProvider} MCP...`;
      const aceResult = await installAceTool(mcpProvider, aceToolBaseUrl, aceToolToken);

      if (aceResult.success) {
        spinner.succeed(chalk.green('安装成功！'));
        console.log();
        console.log(`    ${chalk.green('✓')} ${mcpProvider} MCP ${chalk.gray(`→ ${aceResult.configPath}`)}`);
      } else {
        spinner.warn(chalk.yellow(`${mcpProvider} 配置失败`));
        console.log(chalk.gray(`      ${aceResult.message}`));
      }
    } else if ((mcpProvider === 'ace-tool' || mcpProvider === 'ace-tool-rs') && !aceToolToken) {
      spinner.succeed(chalk.green('安装成功！'));
      console.log();
      console.log(`    ${chalk.yellow('⚠')} ${mcpProvider} MCP 未安装 ${chalk.gray('(Token 未提供)')}`);
      console.log(`    ${chalk.gray('→')} 稍后运行 ${chalk.cyan('npx ccg-ros2-workflow')} 完成配置`);
    } else {
      spinner.succeed(chalk.green('安装成功！'));
    }

    // 显示已安装的命令
    console.log();
    console.log(chalk.cyan('  已安装命令:'));
    const installedCommands = fs.readdirSync(COMMANDS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
    installedCommands.forEach(cmd => {
      console.log(`    ${chalk.green('✓')} /ccg:${cmd}`);
    });

    // 显示已安装的提示词
    const promptsDir = path.join(CCG_DIR, 'prompts');
    if (fs.existsSync(promptsDir)) {
      console.log();
      console.log(chalk.cyan('  已安装提示词:'));
      const modelDirs = ['codex', 'gemini', 'claude'];
      modelDirs.forEach(model => {
        const modelDir = path.join(promptsDir, model);
        if (fs.existsSync(modelDir)) {
          const roles = fs.readdirSync(modelDir)
            .filter(f => f.endsWith('.md'))
            .map(f => f.replace('.md', ''));
          if (roles.length > 0) {
            console.log(`    ${chalk.green('✓')} ${model}: ${roles.join(', ')}`);
          }
        }
      });
    }

    // 显示已安装的二进制文件
    if (fs.existsSync(wrapperDest)) {
      console.log();
      console.log(chalk.cyan('  已安装二进制文件:'));
      console.log(`    ${chalk.green('✓')} codeagent-wrapper ${chalk.gray(`→ ${BIN_DIR}`)}`);

      // 配置 PATH
      const shell = process.env.SHELL || '';
      const isZsh = shell.includes('zsh');
      const shellRc = isZsh ? path.join(homeDir, '.zshrc') : path.join(homeDir, '.bashrc');
      const shellRcDisplay = isZsh ? '~/.zshrc' : '~/.bashrc';
      const exportCommand = `export PATH="${BIN_DIR}:$PATH"`;

      try {
        let rcContent = fs.existsSync(shellRc) ? fs.readFileSync(shellRc, 'utf8') : '';

        if (rcContent.includes(BIN_DIR) || rcContent.includes('/.claude/bin')) {
          console.log(`    ${chalk.green('✓')} PATH ${chalk.gray(`→ ${shellRcDisplay} (已配置)`)}`);
        } else {
          const configLine = `\n# CCG-ROS2 multi-model collaboration system\n${exportCommand}\n`;
          fs.appendFileSync(shellRc, configLine, 'utf8');
          console.log(`    ${chalk.green('✓')} PATH ${chalk.gray(`→ ${shellRcDisplay}`)}`);
        }
      } catch {
        console.log(`    ${chalk.yellow('⚠')} PATH ${chalk.gray('→ 请手动添加到 shell 配置:')}`);
        console.log(`      ${chalk.cyan(exportCommand)}`);
      }
    }

    // 显示 MCP 资源（如果用户跳过了安装）
    if (mcpProvider === 'skip' || ((mcpProvider === 'ace-tool' || mcpProvider === 'ace-tool-rs') && !aceToolToken)) {
      console.log();
      console.log(chalk.cyan.bold('  📖 MCP 服务选项'));
      console.log();
      console.log(chalk.gray('     如需使用代码检索和 Prompt 增强功能，可选择以下 MCP 服务：'));
      console.log();
      console.log(`     ${chalk.green('1.')} ${chalk.cyan('ace-tool')} ${chalk.gray('(推荐)')}: ${chalk.underline('https://augmentcode.com/')}`);
      console.log(`        ${chalk.gray('一键安装，含 Prompt 增强 + 代码检索')}`);
      console.log();
      console.log(`     ${chalk.green('2.')} ${chalk.cyan('ace-tool 中转服务')} ${chalk.yellow('(无需注册)')}: ${chalk.underline('https://linux.do/t/topic/1291730')}`);
      console.log(`        ${chalk.gray('linux.do 社区提供的免费中转服务')}`);
      console.log();
    }

    console.log();

  } catch (error) {
    spinner.fail(chalk.red('安装失败'));
    console.error(error);
  }
}

// ==================== 创建 Agent 文件 ====================

function createAgentFiles() {
  const agents = {
    'system-integrator.md': `---
description: 'ROS2 系统集成设计师 - 设计上层应用架构、Launch 配置、节点交互'
---

# System Integrator - ROS2 系统集成设计

## Role

You are a ROS2 System Integration Designer for physical robot development.

## Responsibilities

- Design inter-node communication architecture
- Plan Launch file structure
- Configure parameter management
- Design RViz visualization configuration

## Output Format

\`\`\`markdown
## System Integration Design

### Node Architecture
### Launch Structure
### Parameter Configuration
### Visualization Configuration
\`\`\`

Code comments in Chinese.
`,
    'planner.md': `---
description: '任务规划师 - 使用 WBS 方法论分解 ROS2 功能需求为可执行任务'
---

# Planner - Task Planning

## Role

You are a Task Planner using WBS methodology for ROS2 robot development.

## Responsibilities

- Decompose requirements into subtasks
- Determine task dependencies
- Estimate task complexity
- Generate implementation plan

## Output Format

\`\`\`markdown
## Implementation Plan

### Task Breakdown
### Dependencies
### Priority Order
### Acceptance Criteria
\`\`\`

Code comments in Chinese.
`,
    'get-current-datetime.md': `---
description: '获取当前日期时间'
---

# Get Current Datetime

Execute date command and return current time.
`
  };

  for (const [filename, content] of Object.entries(agents)) {
    fs.writeFileSync(path.join(AGENTS_DIR, filename), content);
  }
}

// ==================== 安装 ace-tool ====================

async function installAceTool(provider, baseUrl, token) {
  try {
    // 读取或创建配置
    let config = {};
    if (fs.existsSync(CLAUDE_JSON_PATH)) {
      try {
        config = JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, 'utf8'));
      } catch {
        config = {};
      }
    }

    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // 构建 args
    const args = provider === 'ace-tool'
      ? ['-y', 'ace-tool@latest']
      : ['ace-tool-rs'];

    if (baseUrl) {
      args.push('--base-url', baseUrl);
    }
    if (token) {
      args.push('--token', token);
    }

    // 创建 MCP 配置
    const mcpConfig = {
      type: 'stdio',
      command: 'npx',
      args: args,
    };

    if (provider === 'ace-tool-rs') {
      mcpConfig.env = { RUST_LOG: 'info' };
    }

    config.mcpServers['ace-tool'] = mcpConfig;

    // 写入配置
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2));

    return {
      success: true,
      message: `${provider} MCP 配置成功`,
      configPath: '~/.claude.json',
    };
  } catch (error) {
    return {
      success: false,
      message: `配置失败: ${error.message}`,
    };
  }
}

// ==================== 更新 ====================

async function update() {
  console.log();
  console.log(chalk.blue.bold('  🔄 更新工作流'));
  console.log();

  if (!isInstalled()) {
    console.log(chalk.yellow('未检测到安装，请先初始化'));
    return;
  }

  const installedVersion = getInstalledVersion() || '未知';
  console.log(chalk.gray(`  当前版本: v${installedVersion}`));
  console.log(chalk.gray(`  包版本: v${VERSION}`));

  // 检查 npm 最新版本
  let latestVersion = null;
  try {
    const spinner = ora('检查最新版本...').start();
    latestVersion = execSync(`npm view ${PACKAGE_NAME} version`, { encoding: 'utf8', timeout: 10000 }).trim();
    spinner.stop();
    console.log(chalk.gray(`  最新版本: v${latestVersion}`));
  } catch {
    console.log(chalk.gray('  最新版本: 无法获取'));
  }

  if (latestVersion && latestVersion !== VERSION) {
    console.log();
    console.log(chalk.yellow(`  发现新版本 v${latestVersion}`));
    console.log(chalk.gray('  运行以下命令更新:'));
    console.log(chalk.cyan(`    npx ${PACKAGE_NAME}@latest`));
    return;
  }

  if (installedVersion === VERSION) {
    console.log();
    console.log(chalk.green('  ✓ 已是最新版本'));

    const { reinstall } = await inquirer.prompt([{
      type: 'confirm',
      name: 'reinstall',
      message: '是否重新安装工作流文件？',
      default: false,
    }]);

    if (reinstall) {
      await init();
    }
  } else {
    console.log();
    console.log(chalk.blue('  → 更新工作流文件...'));
    await init();
  }
}

// ==================== 配置 MCP ====================

async function configMcp() {
  console.log();
  console.log(chalk.cyan.bold('  🔧 配置 ace-tool MCP'));
  console.log();

  const { selectedMcp } = await inquirer.prompt([{
    type: 'list',
    name: 'selectedMcp',
    message: '选择 MCP 工具',
    choices: [
      {
        name: `ace-tool-rs ${chalk.green('(推荐)')} ${chalk.gray('(Rust 实现)')}`,
        value: 'ace-tool-rs',
      },
      {
        name: `ace-tool ${chalk.gray('(Node.js 实现)')}`,
        value: 'ace-tool',
      },
      {
        name: `${chalk.red('卸载')} ace-tool MCP 配置`,
        value: 'uninstall',
      },
      {
        name: chalk.gray('返回'),
        value: 'back',
      },
    ],
  }]);

  if (selectedMcp === 'back') return;

  if (selectedMcp === 'uninstall') {
    await uninstallMcp();
    return;
  }

  const toolName = selectedMcp;

  console.log();
  console.log(chalk.cyan('     📖 获取 ace-tool 访问方式：'));
  console.log();
  console.log(`     ${chalk.gray('•')} ${chalk.cyan('官方服务')}: ${chalk.underline('https://augmentcode.com/')}`);
  console.log(`       ${chalk.gray('注册账号后获取 Token')}`);
  console.log();
  console.log(`     ${chalk.gray('•')} ${chalk.cyan('中转服务')} ${chalk.yellow('(无需注册)')}: ${chalk.underline('https://linux.do/t/topic/1291730')}`);
  console.log(`       ${chalk.gray('linux.do 社区提供的免费中转服务')}`);
  console.log();

  const { baseUrl, token } = await inquirer.prompt([
    {
      type: 'input',
      name: 'baseUrl',
      message: `Base URL ${chalk.gray('(使用中转服务时必填，官方服务留空)')}`,
      default: '',
    },
    {
      type: 'password',
      name: 'token',
      message: `Token ${chalk.gray('(必填)')}`,
      mask: '*',
      validate: input => input.trim() !== '' || '请输入 Token',
    },
  ]);

  const spinner = ora(`配置 ${toolName} MCP...`).start();
  const result = await installAceTool(toolName, baseUrl, token);

  if (result.success) {
    spinner.succeed(chalk.green(`${toolName} MCP 配置成功`));
    console.log();
    console.log(`    ${chalk.green('✓')} 配置文件 ${chalk.gray(`→ ${result.configPath}`)}`);
    console.log();
    console.log(chalk.yellow('    ⚠️  请重启 Claude Code 使配置生效'));
  } else {
    spinner.fail(chalk.red(result.message));
  }
}

async function uninstallMcp() {
  if (!fs.existsSync(CLAUDE_JSON_PATH)) {
    console.log(chalk.yellow('未找到配置文件'));
    return;
  }

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: chalk.red('确定要移除 ace-tool MCP 配置吗？'),
    default: false,
  }]);

  if (!confirm) {
    console.log(chalk.gray('取消卸载'));
    return;
  }

  try {
    let config = JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, 'utf8'));

    if (!config.mcpServers || !config.mcpServers['ace-tool']) {
      console.log(chalk.yellow('配置中没有 ace-tool'));
      return;
    }

    delete config.mcpServers['ace-tool'];
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2));
    console.log(chalk.green('✅ 已从配置中移除 ace-tool'));
  } catch (e) {
    console.log(chalk.red('❌ 移除失败:'), e.message);
  }
}

// ==================== 帮助 ====================

function showHelp() {
  console.log();
  console.log(chalk.cyan.bold('  📖 CCG-ROS2 帮助'));
  console.log();

  // 开发工作流
  console.log(chalk.yellow.bold('  开发工作流:'));
  console.log(`  ${chalk.green('/ccg:workflow')}    完整7阶段开发工作流`);
  console.log(`  ${chalk.green('/ccg:plan')}        多模型协作规划`);
  console.log(`  ${chalk.green('/ccg:execute')}     多模型协作执行`);
  console.log(`  ${chalk.green('/ccg:frontend')}    上层应用开发 (Gemini 主导)`);
  console.log(`  ${chalk.green('/ccg:backend')}     底层控制开发 (Codex 主导)`);
  console.log(`  ${chalk.green('/ccg:feat')}        智能功能开发`);
  console.log(`  ${chalk.green('/ccg:analyze')}     多模型技术分析`);
  console.log(`  ${chalk.green('/ccg:debug')}       问题诊断 + 修复`);
  console.log(`  ${chalk.green('/ccg:optimize')}    性能优化`);
  console.log(`  ${chalk.green('/ccg:test')}        测试生成`);
  console.log(`  ${chalk.green('/ccg:review')}      代码审查`);
  console.log();

  // Git 工具
  console.log(chalk.yellow.bold('  Git 工具:'));
  console.log(`  ${chalk.green('/ccg:commit')}      智能 Git 提交`);
  console.log(`  ${chalk.green('/ccg:rollback')}    Git 回滚`);
  console.log(`  ${chalk.green('/ccg:clean-branches')} 清理已合并分支`);
  console.log(`  ${chalk.green('/ccg:worktree')}    Git Worktree 管理`);
  console.log();

  // 项目管理
  console.log(chalk.yellow.bold('  项目管理:'));
  console.log(`  ${chalk.green('/ccg:init')}        初始化项目 CLAUDE.md`);
  console.log(`  ${chalk.green('/ccg:enhance')}     Prompt 增强`);
  console.log();

  // 智能路由说明
  console.log(chalk.yellow.bold('  智能路由:'));
  console.log(chalk.gray('  • 控制算法、C++、硬件驱动、实时性 → Codex'));
  console.log(chalk.gray('  • Launch、Python、RViz、配置、诊断 → Gemini'));
  console.log();

  console.log(chalk.gray('  更多信息: https://github.com/GuYu-001/ccg-ros2-workflow'));
  console.log();
}

// ==================== 卸载 ====================

async function uninstall() {
  console.log();

  // 检查是否全局安装
  let isGlobalInstall = false;
  try {
    const result = execSync(`npm list -g ${PACKAGE_NAME} --depth=0`, { encoding: 'utf8', timeout: 5000 });
    isGlobalInstall = result.includes(`${PACKAGE_NAME}@`);
  } catch {
    isGlobalInstall = false;
  }

  if (isGlobalInstall) {
    console.log(chalk.yellow('⚠️  检测到你是通过 npm 全局安装的'));
    console.log();
    console.log('完整卸载需要两步：');
    console.log(`  ${chalk.cyan('1. 移除工作流文件')} (即将执行)`);
    console.log(`  ${chalk.cyan('2. 卸载 npm 全局包')} (需要手动执行)`);
    console.log();
  }

  // 确认卸载
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: isGlobalInstall ? '继续卸载工作流文件？' : '确定要卸载工作流吗？',
    default: false,
  }]);

  if (!confirm) {
    console.log(chalk.gray('卸载已取消'));
    return;
  }

  // 询问是否移除 ace-tool
  let removeAceTool = false;
  if (fs.existsSync(CLAUDE_JSON_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, 'utf8'));
      if (config.mcpServers && config.mcpServers['ace-tool']) {
        const { remove } = await inquirer.prompt([{
          type: 'confirm',
          name: 'remove',
          message: '同时移除 ace-tool MCP 配置？',
          default: false,
        }]);
        removeAceTool = remove;
      }
    } catch {}
  }

  console.log();
  console.log(chalk.yellow('正在卸载...'));

  const removedCommands = [];
  const removedAgents = [];

  // 删除命令目录
  if (fs.existsSync(COMMANDS_DIR)) {
    try {
      const files = fs.readdirSync(COMMANDS_DIR);
      files.filter(f => f.endsWith('.md')).forEach(f => {
        removedCommands.push(f.replace('.md', ''));
      });
      fs.rmSync(COMMANDS_DIR, { recursive: true });
    } catch (error) {
      console.log(chalk.red(`删除命令目录失败: ${error.message}`));
    }
  }

  // 删除 agents 目录
  if (fs.existsSync(AGENTS_DIR)) {
    try {
      const files = fs.readdirSync(AGENTS_DIR);
      files.forEach(f => removedAgents.push(f.replace('.md', '')));
      fs.rmSync(AGENTS_DIR, { recursive: true });
    } catch (error) {
      console.log(chalk.red(`删除 agents 目录失败: ${error.message}`));
    }
  }

  // 删除 .ccg 配置目录
  if (fs.existsSync(CCG_DIR)) {
    try {
      fs.rmSync(CCG_DIR, { recursive: true });
    } catch (error) {
      console.log(chalk.red(`删除配置目录失败: ${error.message}`));
    }
  }

  // 删除 codeagent-wrapper
  const wrapperPath = path.join(BIN_DIR, 'codeagent-wrapper');
  let removedBin = false;
  if (fs.existsSync(wrapperPath)) {
    try {
      fs.unlinkSync(wrapperPath);
      removedBin = true;
    } catch {}
  }

  console.log(chalk.green('✅ 工作流文件已移除'));

  if (removedCommands.length > 0) {
    console.log();
    console.log(chalk.cyan('已移除命令:'));
    removedCommands.forEach(cmd => {
      console.log(`  ${chalk.gray('•')} /ccg:${cmd}`);
    });
  }

  if (removedAgents.length > 0) {
    console.log();
    console.log(chalk.cyan('已移除 agents:'));
    removedAgents.forEach(agent => {
      console.log(`  ${chalk.gray('•')} ${agent}`);
    });
  }

  if (removedBin) {
    console.log();
    console.log(chalk.cyan('已移除二进制文件:'));
    console.log(`  ${chalk.gray('•')} codeagent-wrapper`);
  }

  // 移除 ace-tool
  if (removeAceTool) {
    try {
      let config = JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, 'utf8'));
      delete config.mcpServers['ace-tool'];
      fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2));
      console.log(chalk.green('✅ ace-tool MCP 配置已移除'));
    } catch {}
  }

  // 全局安装提示
  if (isGlobalInstall) {
    console.log();
    console.log(chalk.yellow.bold('🔸 最后一步：卸载 npm 全局包'));
    console.log();
    console.log('请在新的终端窗口中运行：');
    console.log();
    console.log(chalk.cyan.bold(`  npm uninstall -g ${PACKAGE_NAME}`));
    console.log();
    console.log(chalk.gray('(完成后 ccg-ros2-workflow 命令将彻底移除)'));
  }

  console.log();
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
