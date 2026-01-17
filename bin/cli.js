#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const CLAUDE_DIR = path.join(process.env.HOME, '.claude');
const CCG_DIR = path.join(CLAUDE_DIR, '.ccg');
const COMMANDS_DIR = path.join(CLAUDE_DIR, 'commands', 'ccg');
const BIN_DIR = path.join(CLAUDE_DIR, 'bin');
const SRC_DIR = path.join(__dirname, '..', 'src');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

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

async function main() {
  console.log('\n🤖 CCG-ROS2-Workflow 安装程序');
  console.log('================================');
  console.log('ROS2 多模型协作开发工具');
  console.log('Codex (底层) + Gemini (上层) + Claude (编排)\n');

  // 检查是否已安装
  if (fs.existsSync(path.join(CCG_DIR, 'config.toml'))) {
    const overwrite = await question('⚠️  检测到已有安装，是否覆盖？ (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('取消安装');
      rl.close();
      return;
    }
  }

  // 选择操作
  console.log('\n请选择操作：');
  console.log('1. 安装工作流');
  console.log('2. 配置 API 密钥');
  console.log('3. 卸载工作流');
  console.log('4. 退出');

  const choice = await question('\n请输入选项 (1-4): ');

  switch (choice) {
    case '1':
      await install();
      break;
    case '2':
      await configureApiKeys();
      break;
    case '3':
      await uninstall();
      break;
    default:
      console.log('退出');
  }

  rl.close();
}

async function install() {
  console.log('\n📦 开始安装...\n');

  // 创建目录
  [CCG_DIR, COMMANDS_DIR, BIN_DIR].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
  });

  // 复制文件
  console.log('复制配置文件...');
  copyRecursive(path.join(SRC_DIR, 'prompts'), path.join(CCG_DIR, 'prompts'));

  console.log('复制命令文件...');
  copyRecursive(path.join(SRC_DIR, 'commands', 'ccg'), COMMANDS_DIR);

  console.log('复制配置...');
  fs.copyFileSync(
    path.join(SRC_DIR, 'config.toml'),
    path.join(CCG_DIR, 'config.toml')
  );

  // 复制 codeagent-wrapper 脚本
  console.log('安装 codeagent-wrapper...');
  const wrapperSrc = path.join(SRC_DIR, 'codeagent-wrapper.sh');
  const wrapperDest = path.join(BIN_DIR, 'codeagent-wrapper');
  fs.copyFileSync(wrapperSrc, wrapperDest);
  fs.chmodSync(wrapperDest, '755');

  // 替换路径
  const homeDir = process.env.HOME;
  const filesToUpdate = [
    path.join(CCG_DIR, 'config.toml'),
    ...fs.readdirSync(COMMANDS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(COMMANDS_DIR, f))
  ];

  filesToUpdate.forEach(file => {
    replaceInFile(file, {
      '/Users/super': homeDir,
      '\\$HOME': homeDir
    });
  });

  console.log('\n✅ 安装完成！\n');

  // 询问是否配置 API
  const configApi = await question('是否现在配置 API 密钥？ (Y/n): ');
  if (configApi.toLowerCase() !== 'n') {
    await configureApiKeys();
  }

  console.log('\n📖 使用方法：');
  console.log('  在 Claude Code 中使用 /ccg:workflow <任务描述>');
  console.log('  查看所有命令：/ccg:<Tab>');
}

async function configureApiKeys() {
  console.log('\n🔑 配置 API 密钥\n');

  const geminiKey = await question('Gemini API Key (留空跳过): ');
  const geminiBaseUrl = await question('Gemini Base URL (默认 https://api.ikuncode.cc): ');
  const codexKey = await question('Codex API Key (留空跳过): ');

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
    envVars.push(`export GOOGLE_GEMINI_BASE_URL="${geminiBaseUrl || 'https://api.ikuncode.cc'}"`);
    envVars.push('export GEMINI_MODEL="gemini-3-pro-preview"');
  }
  if (codexKey) {
    envVars.push(`export CODEX_API_KEY="${codexKey}"`);
  }

  if (envVars.length > 0) {
    const marker = '# CCG-ROS2-Workflow';
    if (!rcContent.includes(marker)) {
      rcContent += `\n${marker}\n${envVars.join('\n')}\n`;
      fs.writeFileSync(rcPath, rcContent);
      console.log(`\n✅ 已添加到 ~/${shellRc}`);
      console.log(`   请运行: source ~/${shellRc}`);
    } else {
      console.log(`\n⚠️  ~/${shellRc} 中已存在配置，请手动更新`);
    }
  }
}

async function uninstall() {
  console.log('\n🗑️  卸载工作流...\n');

  const confirm = await question('确定要卸载吗？这将删除所有配置文件 (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('取消卸载');
    return;
  }

  // 删除目录
  [CCG_DIR, COMMANDS_DIR].forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
      console.log(`已删除: ${dir}`);
    }
  });

  // 删除 codeagent-wrapper
  const wrapperPath = path.join(BIN_DIR, 'codeagent-wrapper');
  if (fs.existsSync(wrapperPath)) {
    fs.unlinkSync(wrapperPath);
    console.log(`已删除: ${wrapperPath}`);
  }

  console.log('\n✅ 卸载完成');
  console.log('注意: 环境变量需要手动从 ~/.zshrc 或 ~/.bashrc 中删除');
}

main().catch(console.error);
