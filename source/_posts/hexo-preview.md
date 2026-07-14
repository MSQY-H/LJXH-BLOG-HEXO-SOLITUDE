---
title: Hexo Solitude 的本地预览问题与解决方案
date: 2026-07-10 17:25:50
description: Hexo Solitude 主题外挂标签在本地预览时样式丢失的解决思路
tags:
  - Hexo
  - Solitude
categories:
  - 技术
cover: cover.webp
comments: true
ai_text: Hexo Solitude 主题本地预览时外挂标签样式丢失，原因是 hexo s 与插件冲突。解决方案：改用 hexo g 生成静态文件，再通过 npx serve public 启动服务器。提供自动化脚本实现文件监听、增量构建和服务器管理，支持快捷键操作。
---

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

## 写在前面

配置 Solitude 主题时，我遇到了个天大的问题。

Solitude 主题是支持 Hexo 内置的标签语法和 Solitude 的扩展标签。不过，扩展标签要装插件。

{% tabs 安装插件 %}

<!-- tab npm -->

``` Shell
npm install hexo-solitude-tag --save
```

<!-- endtab -->

<!-- tab pnpm -->

``` Shell
pnpm add hexo-solitude-tag
```

<!-- endtab -->

<!-- tab yarn -->

``` Shell
yarn add hexo-solitude-tag
```

<!-- endtab -->

{% endtabs %}

很简单。具体的语法，请看官方文档。{% spoiler 'blur' '话说为什么是放在 demo 而不是文档啊' %}

{% link '外挂标签使用 | Solitude' '这篇文章介绍了外挂标签的使用，包括内置标…' 'https://everfu.github.io/solitude-demo/posts/8f9926b7.html' %}

但是，遇到了问题。

## 大问题

正当我兴致十足，执行了 Hexo 三连，打开了 `localhost:3000` 后：

``` Shell
hexo cl && hexo g && hexo s
```

没想到，标签的样式竟然消失了！

本来这是个按钮：

{% button 'fa-brands fa-github' '我的GitHub' 'https://github.com/MSQY-H' %}

结果变成了：

<i class="fa-brands fa-github"></i>我的GitHub

那可难搞了。

## 解决方案

经过与B大哥与D大哥{% spoiler 'blur' '（必应和 Deepseek）' %}两位好朋友的探讨研究后，我终于发现了问题。

问题在于 `hexo s`。它的生成机制与 `hexo g` 不同，可能内部会与插件产生冲突。

其实不止我一个人有这个问题，网上很多人在使用插件时也有类似问题。

### 手敲命令

其实要解决这个问题很简单，只要分别输入：

``` bash
hexo g
npx serve public
```

就可以了。（不一定要用 `npx serve public`，其他可以启动服务器的命令也可以）

其实原理非常简单：虽然 `hexo s` 实现机制太过复杂，可能会出现问题，但是 `hexo g` 不会有这个问题（要是问题还在，就检查一下代码或者给开发者提 issue 吧）

所以我们曲线救国：通过 `hexo g` 生成静态文件，再通过 `npx serve public` 启动本地服务器。

问题解决了，完美！

但是，这种方式有缺点：

- 没有文件监听，每次都要手动敲，太麻烦了！

### 万物皆可脚本

~~因为懒~~为了让生活更方便，我 Vibe Coding了一下，和D大哥聊了 15 分钟，写了个脚本。

其实这个脚本核心逻辑是这样的：

- 使用 chokidar 监听文件变动
- 执行 `hexo g --incremental`
- 启动静态服务器

{% note 'warning modern' 'fas fa-warning' %}
以下脚本针对我的开发环境编写，不一定通用，并非官方方案，此脚本仅作参考，建议你自己 Vibe Coding。
{% endnote %}

- Node.js 版本：24.17.0
- Yarn 版本：4.17.0
- Hexo 版本：7.3.0
- Solitude 版本：3.0.21

``` JavaScript
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const chokidar = require('chokidar');
const express = require('express');
const serveStatic = require('serve-static');

// ---------- 参数解析 ----------
let PORT = 3000;
let silent = false;
let quickMode = false;
let directServe = false;   // 新增：直接启动服务器，跳过首次构建

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '-h' || arg === '--help') {
    console.log(`
使用方法: node dev.js [端口] [选项]

选项:
  -s, --silent    静默模式，不输出 hexo 日志（错误除外）
  -q, --quick     快速模式，省略手动添加的延迟（防抖延迟除外）
  -d, --direct    直接启动服务器，跳过首次构建（适用于已生成 public 的情况）
  -h, --help      显示此帮助信息

示例:
  node dev.js 4000
  node dev.js -s 4000
  node dev.js -q -d
`);
    process.exit(0);
  } else if (arg === '-s' || arg === '--silent') {
    silent = true;
  } else if (arg === '-q' || arg === '--quick') {
    quickMode = true;
  } else if (arg === '-d' || arg === '--direct') {
    directServe = true;
  } else if (/^\d+$/.test(arg) && PORT === 3000) {
    PORT = parseInt(arg, 10);
  }
}

const CWD = process.cwd();
const PUBLIC_DIR = path.join(CWD, 'public');
const WATCH_PATHS = [
  'source',
  '_config.yml',
  'scaffolds',
  'themes',
  'package.json',
];

const DEBOUNCE_DELAY = 300;
const BAR_LENGTH = 20;
const BOUNCE_WIDTH = 3;
const FRAME_ACTIVE = 100;
const FRAME_IDLE = 500;
const FILL_STAY = quickMode ? 0 : 500;
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// ---------- 状态变量 ----------
let isBuilding = false;
let buildTimer = null;
let server = null;           // 存储 http.Server 实例
let watcher = null;
let lastBuildFailed = false;
let watcherReady = false;

let sliderWidth = BOUNCE_WIDTH;
let sliderPos = 0;
let dir = 1;
let progressMode = 'bounce';
let renderTimeout = null;
let spinnerIdx = 0;
let pendingLogs = [];
let currentBuildProcess = null;

let initializing = false;
let serverStarting = false;
let buildStartTime = 0;
let firstBuild = false;
let hexoErrorContext = false;  // 错误上下文标志

// ---------- 颜色常量 ----------
const RESET = '\x1b[0m';
const BG_BUILD = '\x1b[48;5;208m\x1b[30m';
const BG_RUN   = '\x1b[42m\x1b[37m';
const BG_FAIL  = '\x1b[41m\x1b[37m';
const BG_INIT  = '\x1b[44m\x1b[37m';

const LEVEL_COLORS = {
  INFO:  '\x1b[36m',
  WARN:  '\x1b[33m',
  ERROR: '\x1b[31m',
  HEXO_ERROR: '\x1b[31m',
  SUCCESS:'\x1b[32m',
  DEBUG: '\x1b[35m',
};

// ---------- 工具函数 ----------
function formatTime(seconds) {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m${secs}s`;
  }
  return `${seconds.toFixed(1)}s`;
}

function getProgressBar() {
  const bg = '-', fg = '#';
  if (progressMode === 'fill') return fg.repeat(BAR_LENGTH);
  const w = Math.round(sliderWidth);
  const pos = Math.round(sliderPos);
  let bar = '';
  for (let i = 0; i < BAR_LENGTH; i++) bar += (i >= pos && i < pos + w) ? fg : bg;
  return bar;
}

// ---------- 统一日志系统 ----------
function flushLogs() {
  if (!pendingLogs.length) return;
  const lines = [...pendingLogs];
  pendingLogs = [];
  process.stdout.write('\r\x1b[K');
  lines.forEach(l => console.log(l));
}

const YARN_PATTERN = /This project is configured to use yarn/i;

function outputLog(category, levelOrType, message, extra = {}) {
  if (category === 'hexo') {
    let line = message.trimEnd();
    if (!line || YARN_PATTERN.test(line)) return;

    const match = line.match(/^(INFO|WARN|ERROR|DEBUG)\s+(.*)/i);
    let level = 'INFO', msg = line;
    if (match) { level = match[1].toUpperCase(); msg = match[2]; }

    if (/\b(FATAL|YAMLException)\b/i.test(line)) {
      level = 'ERROR';
    }

    const isFatal = /\b(FATAL|YAMLException)\b/i.test(line);
    const isErrorDesc = /Error:\s/i.test(line);
    const isCodeLine = /^\s+\d+\s*\|/.test(line) || line.includes('---^');
    const isStackLine = /^\s+at\s/.test(line);
    const isError = (level === 'ERROR') || isFatal || isErrorDesc || isCodeLine || isStackLine;

    // 错误上下文管理
    if (isError) {
      hexoErrorContext = true;   // 进入错误上下文
    } else if (hexoErrorContext) {
      if (level === 'INFO' && !isError) {
        hexoErrorContext = false;
      } else if (level === 'DEBUG') {
        hexoErrorContext = false;
      } else if (level === 'WARN') {
        // 保留上下文
      }
    }

    if (silent && !isError && !hexoErrorContext) return;

    let prefixColor;
    if (level === 'INFO') prefixColor = LEVEL_COLORS.INFO;
    else if (level === 'DEBUG') prefixColor = LEVEL_COLORS.DEBUG;
    else prefixColor = LEVEL_COLORS.HEXO_ERROR;

    let bodyColor = '';
    if (level === 'ERROR' || isFatal || isErrorDesc) bodyColor = '\x1b[31m';
    else if (isCodeLine) bodyColor = '\x1b[34m';
    else if (isStackLine) bodyColor = '\x1b[33m';

    const prefix = ` ${prefixColor}│➤ [hexo] [${level}]${RESET}`;
    const body = bodyColor ? `${bodyColor}${msg}${RESET}` : msg;
    pendingLogs.push(`${prefix} ${body}`);

  } else if (category === 'dev') {
    process.stdout.write('\r\x1b[K');
    let prefix, body, color = '';
    const type = levelOrType;

    if (type === 'stepStart') {
      color = LEVEL_COLORS.INFO;
      prefix = ` ${color}┌➤ [dev] [INFO]${RESET}`;
      body = `${extra.emoji || '🚀'} ${message}`;
    } else if (type === 'stepMid') {
      color = LEVEL_COLORS.INFO;
      prefix = ` ${color}│➤ [dev] [INFO]${RESET}`;
      body = `📘 ${message}`;
    } else if (type === 'stepEndSuccess') {
      color = LEVEL_COLORS.SUCCESS;
      prefix = ` ${color}└➤ [dev] [SUCCESS]${RESET}`;
      body = `✨ ${message}`;
    } else if (type === 'stepEndFail') {
      color = LEVEL_COLORS.ERROR;
      prefix = ` ${color}└➤ [dev] [ERROR]${RESET}`;
      body = `❌ ${message}`;
    } else if (type === 'info') {
      color = LEVEL_COLORS.INFO;
      prefix = `  ➤ ${color}[dev] [INFO]${RESET}`;
      body = `📘 ${message}`;
    } else {
      prefix = `[dev]`;
      body = message;
    }
    console.log(`${prefix} ${body}`);
  }
}

function logHexoLine(line) { outputLog('hexo', null, line); }
function logStepStart(msg, emoji = '🚀') { outputLog('dev', 'stepStart', msg, { emoji }); }
function logStepMid(msg) { outputLog('dev', 'stepMid', msg); }
function logStepEndSuccess(msg) { outputLog('dev', 'stepEndSuccess', msg); }
function logStepEndFail(msg) { outputLog('dev', 'stepEndFail', msg); }
function devInfo(msg) { outputLog('dev', 'info', msg); }

function printShortcuts() {
  devInfo('快捷键: Ctrl+C 退出 | Ctrl+R 完整重建 | Ctrl+S 启动/重启服务器');
}

// ---------- 网络与服务器 ----------
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

function startServer() {
  if (server || serverStarting) return;
  serverStarting = true;

  logStepStart('启动服务器');

  const delay = quickMode ? 0 : 1000;
  setTimeout(() => {
    const app = express();
    app.use(serveStatic(PUBLIC_DIR, { index: 'index.html', setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
    app.use((req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

    const httpServer = app.listen(PORT, () => {
      serverStarting = false;
      server = httpServer;
      const localIP = getLocalIP();
      logStepMid(`本地访问: http://localhost:${PORT}`);
      logStepMid(`局域网访问: http://${localIP}:${PORT}`);
      if (watcher) logStepMid('文件监控已就绪');
      logStepEndSuccess('服务器已启动');
      printShortcuts();
      scheduleScroll();
    });

    httpServer.on('error', err => {
      serverStarting = false;
      logStepEndFail(`服务器错误: ${err.message}`);
    });
  }, delay);
}

// ---------- 文件监控 ----------
function startWatcher() {
  if (watcher) return;
  watcher = chokidar.watch(WATCH_PATHS, {
    ignoreInitial: true, persistent: true, cwd: CWD,
    ignored: [/(^|[\/\\])\../, /\.tmp$/i, /~$/, /\.sw[op]$/i, /\.bak$/i],
  });
  watcher.on('add', p => { scheduleBuild(`新增: ${p}`); devInfo(`新增文件: ${p}`); });
  watcher.on('change', p => { scheduleBuild(`变更: ${p}`); devInfo(`文件变化: ${p}`); });
  watcher.on('unlink', p => { scheduleBuild(`删除: ${p}`); devInfo(`文件删除: ${p}`); });
  watcher.on('ready', () => {
    watcherReady = true;
    // 如果服务器还未启动，则启动（直接模式下由外部调用）
    startServer();
  });
}

// ---------- 构建逻辑 ----------
function abortCurrentBuild() {
  if (currentBuildProcess) {
    devInfo('检测到新的变更，中止当前构建...');
    try { currentBuildProcess.kill('SIGTERM'); } catch (e) {}
    currentBuildProcess = null;
  }
}

function build(trigger) {
  if (buildTimer) { clearTimeout(buildTimer); buildTimer = null; }
  if (isBuilding) abortCurrentBuild();

  hexoErrorContext = false;
  isBuilding = true;
  lastBuildFailed = false;
  initializing = false;
  progressMode = 'bounce';
  sliderWidth = BOUNCE_WIDTH;
  sliderPos = 0;
  dir = 1;
  buildStartTime = Date.now();

  logStepStart(`构建开始 (${trigger})`);
  forceRender();
  currentBuildProcess = runHexo(['g', '--incremental']);
}

function fullRebuild() {
  if (isBuilding) abortCurrentBuild();

  hexoErrorContext = false;
  isBuilding = true;
  lastBuildFailed = false;
  initializing = false;
  progressMode = 'bounce';
  sliderWidth = BOUNCE_WIDTH;
  sliderPos = 0;
  dir = 1;
  const totalStart = Date.now();
  buildStartTime = totalStart;

  logStepStart('完整重建 - 清理 (hexo clean)');
  forceRender();

  const clean = spawn('hexo', ['clean'], { cwd: CWD, stdio: ['ignore','pipe','pipe'] });
  currentBuildProcess = clean;
  let cleanOut = '', cleanErr = '';
  clean.stdout.on('data', d => {
    cleanOut += d.toString();
    const lines = cleanOut.split('\n');
    cleanOut = lines.pop();
    lines.forEach(logHexoLine);
  });
  clean.stderr.on('data', d => {
    cleanErr += d.toString();
    const lines = cleanErr.split('\n');
    cleanErr = lines.pop();
    lines.forEach(logHexoLine);
  });

  clean.on('close', code => {
    if (cleanOut) logHexoLine(cleanOut);
    if (cleanErr) logHexoLine(cleanErr);
    if (currentBuildProcess !== clean) return;

    const cleanTime = (Date.now() - totalStart) / 1000;
    if (code !== 0) {
      isBuilding = false;
      lastBuildFailed = true;
      logStepEndFail(`清理失败 (${formatTime(cleanTime)})，重建中止`);
      currentBuildProcess = null;
      startFillThenScroll();
      return;
    }
    logStepEndSuccess(`清理完成 (${formatTime(cleanTime)})`);

    logStepStart('完整重建 - 生成 (hexo g)');
    const genStart = Date.now();
    currentBuildProcess = runHexo(['g'], {
      suppressEndLog: true,
      onClose: (genCode) => {
        const genTime = (Date.now() - genStart) / 1000;
        const totalTime = (Date.now() - totalStart) / 1000;
        if (genCode === 0) {
          logStepEndSuccess(`生成完成 (${formatTime(genTime)})`);
          logStepEndSuccess(`完整重建完成，总耗时 ${formatTime(totalTime)}`);
        } else {
          logStepEndFail(`生成失败 (${formatTime(genTime)})，退出码 ${genCode}`);
          logStepEndFail(`完整重建失败，总耗时 ${formatTime(totalTime)}`);
        }
      }
    });
  });

  clean.on('error', err => {
    if (currentBuildProcess !== clean) return;
    const cleanTime = (Date.now() - totalStart) / 1000;
    isBuilding = false;
    lastBuildFailed = true;
    logStepEndFail(`清理错误: ${err.message} (${formatTime(cleanTime)})`);
    currentBuildProcess = null;
    startFillThenScroll();
  });
}

function runHexo(args, opts = {}) {
  const { suppressEndLog = false, onClose } = opts;
  const child = spawn('hexo', args, { cwd: CWD, stdio: ['ignore','pipe','pipe'] });
  let outBuf = '', errBuf = '';

  child.stdout.on('data', d => {
    outBuf += d.toString();
    const lines = outBuf.split('\n');
    outBuf = lines.pop();
    lines.forEach(logHexoLine);
  });
  child.stderr.on('data', d => {
    errBuf += d.toString();
    const lines = errBuf.split('\n');
    errBuf = lines.pop();
    lines.forEach(logHexoLine);
  });

  child.on('close', code => {
    if (currentBuildProcess !== child) return;
    if (outBuf) logHexoLine(outBuf);
    if (errBuf) logHexoLine(errBuf);

    const elapsed = (Date.now() - buildStartTime) / 1000;
    isBuilding = false;
    lastBuildFailed = (code !== 0);
    currentBuildProcess = null;
    hexoErrorContext = false;

    if (!suppressEndLog) {
      if (code === 0) {
        logStepEndSuccess(`构建完成 (${formatTime(elapsed)})`);
      } else {
        logStepEndFail(`构建失败 (${formatTime(elapsed)})，退出码 ${code}`);
      }
    }

    if (firstBuild && code === 0) {
      firstBuild = false;
      startWatcher();
      startServer();
    } else if (firstBuild && code !== 0) {
      firstBuild = false;
      logStepEndFail('首次构建失败，退出');
      process.exit(1);
    }

    if (onClose) onClose(code);
    startFillThenScroll();
  });

  child.on('error', err => {
    if (currentBuildProcess !== child) return;
    const elapsed = (Date.now() - buildStartTime) / 1000;
    isBuilding = false;
    lastBuildFailed = true;
    currentBuildProcess = null;
    hexoErrorContext = false;

    if (!suppressEndLog) {
      logStepEndFail(`构建进程错误: ${err.message} (${formatTime(elapsed)})`);
    }
    if (firstBuild) {
      firstBuild = false;
      process.exit(1);
    }
    if (onClose) onClose(-1);
    startFillThenScroll();
  });

  return child;
}

// ---------- 进度动画控制 ----------
function startFillThenScroll() {
  if (progressMode === 'fill') return;
  sliderWidth = BAR_LENGTH;
  sliderPos = 0;
  progressMode = 'fill';
  if (FILL_STAY > 0) {
    setTimeout(() => {
      if (server && !isBuilding) {
        sliderWidth = BOUNCE_WIDTH;
        sliderPos = -sliderWidth;
        progressMode = 'scroll';
      }
    }, FILL_STAY);
  } else {
    if (server && !isBuilding) {
      sliderWidth = BOUNCE_WIDTH;
      sliderPos = -sliderWidth;
      progressMode = 'scroll';
    }
  }
}

function scheduleScroll() {
  if (!isBuilding && server && !serverStarting && progressMode !== 'scroll') {
    sliderWidth = BOUNCE_WIDTH;
    sliderPos = -sliderWidth;
    progressMode = 'scroll';
  }
}

function scheduleBuild(trigger) {
  if (buildTimer) clearTimeout(buildTimer);
  buildTimer = setTimeout(() => { buildTimer = null; build(trigger); }, DEBOUNCE_DELAY);
}

function forceRender() {
  if (renderTimeout) { clearTimeout(renderTimeout); renderTimeout = null; }
  renderLine();
  scheduleRender();
}

function scheduleRender() {
  if (renderTimeout) clearTimeout(renderTimeout);
  const active = initializing || isBuilding || serverStarting || progressMode === 'fill';
  const interval = active ? FRAME_ACTIVE : FRAME_IDLE;
  renderTimeout = setTimeout(() => {
    spinnerIdx++;
    renderLine();
    scheduleRender();
  }, interval);
}

// ---------- 状态栏渲染 ----------
function renderLine() {
  flushLogs();
  updateProgress();

  let bgStyle;
  if (initializing) {
    bgStyle = BG_INIT;
  } else if (isBuilding) {
    bgStyle = BG_BUILD;
  } else if (lastBuildFailed) {
    bgStyle = BG_FAIL;
  } else if (serverStarting || server) {
    bgStyle = BG_RUN;
  } else {
    bgStyle = RESET;
  }

  const spinner = isBuilding ? SPINNER_FRAMES[spinnerIdx % SPINNER_FRAMES.length] : ' ';
  const mark = (server && !serverStarting) ? '' : '[x]';
  let statusText;

  if (initializing) {
    statusText = `初始化中 ${mark}端口:${PORT}`;
  } else if (serverStarting) {
    statusText = `启动服务器中 ${mark}端口:${PORT}`;
  } else if (isBuilding) {
    const elapsed = buildStartTime ? (Date.now() - buildStartTime) / 1000 : 0;
    statusText = `构建中 ${formatTime(elapsed)} ${mark}端口:${PORT}`;
  } else if (lastBuildFailed) {
    statusText = `构建失败 ${mark}端口:${PORT}`;
  } else if (server) {
    statusText = `运行中 端口:${PORT}`;
  } else {
    statusText = `就绪 ${mark}端口:${PORT}`;
  }

  process.stdout.write(`\r\x1b[K${bgStyle} ${spinner} [${getProgressBar()}] ${statusText} ${RESET}`);
}

function updateProgress() {
  if (progressMode === 'bounce') {
    sliderPos += dir;
    if (sliderPos + sliderWidth >= BAR_LENGTH) { sliderPos = BAR_LENGTH - sliderWidth; dir = -1; }
    else if (sliderPos <= 0) { sliderPos = 0; dir = 1; }
  } else if (progressMode === 'scroll') {
    sliderPos += 1;
    if (sliderPos > BAR_LENGTH) sliderPos = -sliderWidth;
  }
}

// ---------- 欢迎语 ----------
function printWelcome() {
  flushLogs();
  console.log(`\x1b[36m✨ 欢迎使用LJXH的Hexo构建脚本 (∠・ω< )⌒☆！\x1b[0m`);
  console.log(`\x1b[90m⚡ Node.js:\x1b[0m ${process.version}`);

  let pm = 'npm', pmIcon = '📦';
  try {
    if (fs.existsSync(path.join(CWD, 'yarn.lock'))) { pm = 'yarn'; pmIcon = '🧶'; }
    else if (fs.existsSync(path.join(CWD, 'pnpm-lock.yaml'))) { pm = 'pnpm'; pmIcon = '📦'; }
    else {
      const pkg = JSON.parse(fs.readFileSync(path.join(CWD, 'package.json'), 'utf8'));
      if (pkg.packageManager && pkg.packageManager.includes('yarn')) { pm = 'yarn'; pmIcon = '🧶'; }
    }
    const pmVersion = execSync(`${pm} --version`, { encoding: 'utf8' }).trim();
    console.log(`${pmIcon} ${pm}: ${pmVersion}`);
  } catch {}

  try {
    const hexoVersion = require(path.join(CWD, 'node_modules/hexo/package.json')).version;
    console.log(`🌐 Hexo: ${hexoVersion}`);
  } catch {}

  try {
    const config = fs.readFileSync(path.join(CWD, '_config.yml'), 'utf8');
    const theme = config.match(/^theme:\s*(\S+)/m)?.[1];
    if (theme) console.log(`🎨 主题: ${theme}`);
  } catch {}
  console.log('');
  printShortcuts();
}

// ---------- Ctrl+S 重启服务器 ----------
function restartServer() {
  if (server) {
    devInfo('正在重启服务器...');
    server.close(() => {
      server = null;
      startServer();
    });
  } else {
    devInfo('正在启动服务器...');
    startServer();
  }
}

// ---------- 退出 ----------
function gracefulExit() {
  process.stdout.write(`\r\x1b[K${RESET}\n`);
  console.log('👋 感谢使用，下次见 (´• ω •`)ﾉ ♪');
  if (renderTimeout) clearTimeout(renderTimeout);
  if (server) server.close();
  if (watcher) watcher.close();
  if (process.stdin.isTTY) { process.stdin.setRawMode(false); process.stdin.pause(); }
  process.exit(0);
}

// ---------- 初始化 ----------
function init() {
  initializing = true;
  hexoErrorContext = false;
  scheduleRender();

  printWelcome();

  // 确保 public 目录存在（如果是直接启动而目录不存在，给出警告但不阻止启动）
  if (!fs.existsSync(PUBLIC_DIR)) {
    if (directServe) {
      devInfo('public 目录不存在，服务器可能返回 404，建议先执行 hexo generate');
    } else {
      fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    }
  }

  const delay = quickMode ? 0 : 1000;
  setTimeout(() => {
    if (directServe) {
      // 直接启动模式：跳过首次构建，直接启动服务器和文件监控
      initializing = false;
      logStepStart('直接启动模式 (跳过构建)', '⚡');
      startWatcher();   // 启动监控（会内部调用 startServer）
      startServer();    // 确保服务器启动
      // 强制渲染一帧，让状态栏更新
      forceRender();
    } else {
      // 正常首次构建
      logStepStart('首次构建');
      firstBuild = true;
      isBuilding = true;
      lastBuildFailed = false;
      initializing = false;
      progressMode = 'bounce';
      sliderWidth = BOUNCE_WIDTH;
      sliderPos = 0;
      dir = 1;
      buildStartTime = Date.now();
      forceRender();
      currentBuildProcess = runHexo(['g', '--incremental']);
    }
  }, delay);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', chunk => {
      if (chunk.length === 1) {
        if (chunk[0] === 3) gracefulExit();          // Ctrl+C
        else if (chunk[0] === 18) fullRebuild();     // Ctrl+R
        else if (chunk[0] === 19) restartServer();   // Ctrl+S
      }
    });
  }
  process.on('SIGINT', gracefulExit);
}

init();
```

在博客根目录保存为 `dev.js`（或者其他的名字也可以）

先安装依赖：

{% tabs 安装插件 %}

<!-- tab npm -->

``` Shell
npm install chokidar express serve-static --save
```

<!-- endtab -->

<!-- tab pnpm -->

``` Shell
pnpm add chokidar express serve-static
```

<!-- endtab -->

<!-- tab yarn -->

``` Shell
yarn add chokidar express serve-static
```

<!-- endtab -->

{% endtabs %}

注意 Hexo 要全局安装。

然后直接运行命令：

``` Shell
node dev.js [端口] [选项]
```

选项有这几个：

| 选项 | 简写 | 含义 |
| --- | --- | --- |
| `--silent` | `-s` | 静默模式，只输出脚本日志和 Hexo 的错误日志 |
| `--quick` | `-q` | 快速模式，跳过手动添加的延迟 |
| `--direct` | `-d` | 直接启动服务器，跳过首次构建（请确保静态文件已生成） |
| `--help` | `-h` | 输出帮助 |

可以使用以下快捷键：
 - {% keyboard 'ctrl' %} + {% keyboard 'C' %} ：退出脚本
 - {% keyboard 'ctrl' %} + {% keyboard 'R' %}：完整重构（hexo cl + hexo g）
 - {% keyboard 'ctrl' %} + {% keyboard 'S' %}：重启本地服务器

脚本使用 chokidar 库，支持监测文件变动自动重新构建。以后改文章不用重新输入命令了！

另外，脚本自动构建使用的是 `hexo g --incremental`，对于文章变动比较高效。如果你改动了配置文件或主题文件，建议执行一次完整重建。

太方便了！当然，你也可以自己 Vibe Coding 一个，实现自己想要的功能！

## 说在最后

本地预览的问题可算是解决了，这下可以安心写文章了。

以后打算再写一下关于 Hexo Solitude 的懒加载问题。随缘更新。

✨