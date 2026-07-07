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
let quickMode = false;   // -q 跳过手动延迟

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '-h' || arg === '--help') {
    console.log(`
使用方法: node dev.js [端口] [选项]

选项:
  -s, --silent    静默模式，不输出 hexo 日志（错误除外）
  -q, --quick     快速模式，省略手动添加的延迟（防抖延迟除外）
  -h, --help      显示此帮助信息

示例:
  node dev.js 4000
  node dev.js -s 4000
  node dev.js -q
`);
    process.exit(0);
  } else if (arg === '-s' || arg === '--silent') {
    silent = true;
  } else if (arg === '-q' || arg === '--quick') {
    quickMode = true;
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
const FILL_STAY = quickMode ? 0 : 500;   // -q 时填充立即消失
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// ---------- 状态 ----------
let isBuilding = false;
let buildTimer = null;
let server = null;
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

// ---------- 颜色 ----------
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

// ---------- 时间格式化 ----------
function formatTime(seconds) {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m${secs}s`;
  }
  return `${seconds.toFixed(1)}s`;
}

// ---------- 进度条 ----------
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

// 核心日志函数
function outputLog(category, levelOrType, message, extra = {}) {
  if (category === 'hexo') {
    // hexo 输出处理，与原来的 logHexo 逻辑相同
    let line = message.trimEnd();
    if (!line || YARN_PATTERN.test(line)) return;

    const match = line.match(/^(INFO|WARN|ERROR|DEBUG)\s+(.*)/i);
    let level = 'INFO', msg = line;
    if (match) { level = match[1].toUpperCase(); msg = match[2]; }

    const isFatal = /\b(FATAL|YAMLException)\b/i.test(line);
    const isErrorDesc = /Error:\s/i.test(line);
    const isCodeLine = /^\s+\d+\s*\|/.test(line) || line.includes('---^');
    const isStackLine = /^\s+at\s/.test(line);
    const isError = (level === 'ERROR') || isFatal || isErrorDesc || isCodeLine || isStackLine;

    if (silent && !isError) return;

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
    // dev 日志，直接输出
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
      // fallback
      prefix = `[dev]`;
      body = message;
    }
    console.log(`${prefix} ${body}`);
  }
}

// 便捷包装
function logHexoLine(line) {
  outputLog('hexo', null, line);
}
function logStepStart(msg, emoji = '🚀') {
  outputLog('dev', 'stepStart', msg, { emoji });
}
function logStepMid(msg) {
  outputLog('dev', 'stepMid', msg);
}
function logStepEndSuccess(msg) {
  outputLog('dev', 'stepEndSuccess', msg);
}
function logStepEndFail(msg) {
  outputLog('dev', 'stepEndFail', msg);
}
function devInfo(msg) {
  outputLog('dev', 'info', msg);
}

function printShortcuts() {
  devInfo('快捷键: Ctrl+C 退出 | Ctrl+R 完整重建 | Ctrl+S 启动/重启服务器');
}

// ---------- 获取局域网 IP ----------
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
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
    bgStyle = BG_RUN;   // 启动中或运行中均绿色
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

// ---------- 服务器 ----------
function startServer() {
  if (server || serverStarting) return;
  serverStarting = true;

  outputLog('dev', 'stepStart', '启动服务器', '🚀');

  const delay = quickMode ? 0 : 1000;
  setTimeout(() => {
    const app = express();
    app.use(serveStatic(PUBLIC_DIR, { index: 'index.html', setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
    app.use((req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

    const httpServer = app.listen(PORT, () => {
      serverStarting = false;
      server = httpServer;               // ✅ 改为赋值 HTTP 服务器实例
      const localIP = getLocalIP();
      outputLog('dev', 'stepMid', `本地访问: http://localhost:${PORT}`);
      outputLog('dev', 'stepMid', `局域网访问: http://${localIP}:${PORT}`);
      outputLog('dev', 'stepMid', '文件监控已就绪');
      outputLog('dev', 'stepEndSuccess', '服务器已启动');
      printShortcuts();
      scheduleScroll();
    });

    // 错误处理需要挂在 httpServer 上
    httpServer.on('error', err => {
      serverStarting = false;
      outputLog('dev', 'stepEndFail', `服务器错误: ${err.message}`);
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
    // 如果服务器还未启动（可能被快速构建先调用了），则启动
    startServer();
  });
}

// ---------- 构建 ----------
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

  isBuilding = true;
  lastBuildFailed = false;
  initializing = false;
  progressMode = 'bounce';
  sliderWidth = BOUNCE_WIDTH;
  sliderPos = 0;
  dir = 1;
  buildStartTime = Date.now();

  outputLog('dev', 'stepStart', `构建开始 (${trigger})`);
  forceRender();
  currentBuildProcess = runHexo(['g', '--incremental']);
}

function fullRebuild() {
  if (isBuilding) abortCurrentBuild();

  isBuilding = true;
  lastBuildFailed = false;
  initializing = false;
  progressMode = 'bounce';
  sliderWidth = BOUNCE_WIDTH;
  sliderPos = 0;
  dir = 1;
  const totalStart = Date.now();
  buildStartTime = totalStart;

  outputLog('dev', 'stepStart', '完整重建 - 清理 (hexo clean)');
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
      outputLog('dev', 'stepEndFail', `清理失败 (${formatTime(cleanTime)})，重建中止`);
      currentBuildProcess = null;
      startFillThenScroll();
      return;
    }
    outputLog('dev', 'stepEndSuccess', `清理完成 (${formatTime(cleanTime)})`);

    // 开始生成步骤
    outputLog('dev', 'stepStart', '完整重建 - 生成 (hexo g)');
    const genStart = Date.now();
    currentBuildProcess = runHexo(['g'], {
      suppressEndLog: true,
      onClose: (genCode) => {
        const genTime = (Date.now() - genStart) / 1000;
        const totalTime = (Date.now() - totalStart) / 1000;

        if (genCode === 0) {
          outputLog('dev', 'stepEndSuccess', `生成完成 (${formatTime(genTime)})`);
          outputLog('dev', 'stepEndSuccess', `完整重建完成，总耗时 ${formatTime(totalTime)}`);
        } else {
          outputLog('dev', 'stepEndFail', `生成失败 (${formatTime(genTime)})，退出码 ${genCode}`);
          outputLog('dev', 'stepEndFail', `完整重建失败，总耗时 ${formatTime(totalTime)}`);
        }
        // 状态已由 runHexo 更新，无需重复
      }
    });
  });

  clean.on('error', err => {
    if (currentBuildProcess !== clean) return;
    const cleanTime = (Date.now() - totalStart) / 1000;
    isBuilding = false;
    lastBuildFailed = true;
    outputLog('dev', 'stepEndFail', `清理错误: ${err.message} (${formatTime(cleanTime)})`);
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

    if (!suppressEndLog) {
      if (code === 0) {
        outputLog('dev', 'stepEndSuccess', `构建完成 (${formatTime(elapsed)})`);
      } else {
        outputLog('dev', 'stepEndFail', `构建失败 (${formatTime(elapsed)})，退出码 ${code}`);
      }
    }

    // 首次构建成功后自动启动服务器和监控
    if (firstBuild && code === 0) {
      firstBuild = false;
      startWatcher();     // 内部会调用 startServer
      // 如果 watcher 还没 ready，startServer 会直接执行（因为 serverStarting 锁）
      startServer();      // 立即尝试启动，防止等待 watcher ready 延迟
    } else if (firstBuild && code !== 0) {
      firstBuild = false;
      // 首次构建失败直接退出，但需要打印总耗时
      outputLog('dev', 'stepEndFail', `首次构建失败，退出`);
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

    if (!suppressEndLog) {
      outputLog('dev', 'stepEndFail', `构建进程错误: ${err.message} (${formatTime(elapsed)})`);
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

// 填满 → 滚动
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
    // -q 模式直接变为滚动
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
  // 初始化状态使用与构建相同的刷新间隔
  const active = initializing || isBuilding || serverStarting || progressMode === 'fill';
  const interval = active ? FRAME_ACTIVE : FRAME_IDLE;
  renderTimeout = setTimeout(() => {
    spinnerIdx++;
    renderLine();
    scheduleRender();
  }, interval);
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
  // 先显示蓝色进度条（初始化状态）
  initializing = true;
  scheduleRender();

  // 输出欢迎语
  printWelcome();

  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  // 延迟 1 秒后开始首次构建（-q 则无延迟）
  const delay = quickMode ? 0 : 1000;
  setTimeout(() => {
    outputLog('dev', 'stepStart', '首次构建');
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
  }, delay);

  // 键盘监听
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