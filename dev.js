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

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '-h' || arg === '--help') {
    console.log(`
使用方法: node dev.js [端口] [选项]

选项:
  -s, --silent    静默模式，不输出 hexo 日志（错误除外）
  -h, --help      显示此帮助信息

示例:
  node dev.js 4000
  node dev.js -s 4000
`);
    process.exit(0);
  } else if (arg === '-s' || arg === '--silent') {
    silent = true;
  } else if (/^\d+$/.test(arg) && PORT === 3000) {
    PORT = parseInt(arg, 10);
  }
}

const CWD = process.cwd();          // 用户博客根目录
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
const FILL_STAY = 500;
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

// ---------- 颜色 ----------
const RESET = '\x1b[0m';
const BG_BUILD = '\x1b[48;5;208m\x1b[30m';
const BG_RUN   = '\x1b[42m\x1b[37m';
const BG_FAIL  = '\x1b[41m\x1b[37m';

const LEVEL_COLORS = {
  INFO:  '\x1b[36m',
  WARN:  '\x1b[33m',
  ERROR: '\x1b[31m',
  HEXO_ERROR: '\x1b[31m',
  SUCCESS:'\x1b[32m',
  DEBUG: '\x1b[35m',
};

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

// ---------- 状态栏 ----------
function renderLine() {
  flushLogs();
  updateProgress();

  let bgStyle;
  if (isBuilding) bgStyle = BG_BUILD;
  else if (lastBuildFailed) bgStyle = BG_FAIL;
  else if (server) bgStyle = BG_RUN;
  else bgStyle = RESET;

  const spinner = isBuilding ? SPINNER_FRAMES[spinnerIdx % SPINNER_FRAMES.length] : ' ';
  const mark = server ? '' : '[x]';
  let statusText;
  if (isBuilding) statusText = `构建中 ${mark}端口:${PORT}`;
  else if (lastBuildFailed) statusText = `构建失败 ${mark}端口:${PORT}`;
  else if (server) statusText = `运行中 端口:${PORT}`;
  else statusText = `初始化 ${mark}端口:${PORT}`;

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

// ---------- 日志系统 ----------
function flushLogs() {
  if (!pendingLogs.length) return;
  const lines = [...pendingLogs];
  pendingLogs = [];
  process.stdout.write('\r\x1b[K');
  lines.forEach(l => console.log(l));
}

const YARN_PATTERN = /This project is configured to use yarn/i;

function logHexo(line) {
  line = line.trimEnd();
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
  if (level === 'ERROR') {
    bodyColor = '\x1b[31m';
  } else if (isFatal || isErrorDesc) {
    bodyColor = '\x1b[31m';
  } else if (isCodeLine) {
    bodyColor = '\x1b[34m';
  } else if (isStackLine) {
    bodyColor = '\x1b[33m';
  }

  const prefix = ` ${prefixColor}│➤ [hexo] [${level}]${RESET}`;
  const body = bodyColor ? `${bodyColor}${msg}${RESET}` : msg;
  pendingLogs.push(`${prefix} ${body}`);
}

// 步骤日志
function logStepStart(msg) {
  process.stdout.write(`\r\x1b[K ${LEVEL_COLORS.INFO}┌➤ [dev] [INFO]${RESET} 🚀 ${msg}\n`);
}
function logStepMid(msg) {
  process.stdout.write(`\r\x1b[K ${LEVEL_COLORS.INFO}│➤ [dev] [INFO]${RESET} 📘 ${msg}\n`);
}
function logStepEnd(msg, success = true) {
  const emoji = success ? '✨' : '❌';
  const level = success ? 'SUCCESS' : 'ERROR';
  const color = LEVEL_COLORS[level];
  process.stdout.write(`\r\x1b[K ${color}└➤ [dev] [${level}]${RESET} ${emoji} ${msg}\n`);
}
function devInfo(msg) {
  process.stdout.write(`\r\x1b[K  ➤ ${LEVEL_COLORS.INFO}[dev] [INFO]${RESET} 📘 ${msg}\n`);
}

function printShortcuts() {
  devInfo('按 Ctrl+C 退出，Ctrl+R 完整重建');
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

// ---------- 服务器 ----------
function startServer() {
  if (server) return;
  const app = express();
  app.use(serveStatic(PUBLIC_DIR, { index: 'index.html', setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
  app.use((req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  logStepStart('启动服务器');
  server = app.listen(PORT, () => {
    const localIP = getLocalIP();
    logStepMid(`本地访问: http://localhost:${PORT}`);
    logStepMid(`局域网访问: http://${localIP}:${PORT}`);
    logStepMid('文件监控已就绪');
    logStepEnd('服务器已启动', true);
    printShortcuts();
    scheduleScroll();
  });
  server.on('error', err => logStepEnd(`服务器错误: ${err.message}`, false));
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
  progressMode = 'bounce';
  sliderWidth = BOUNCE_WIDTH;
  sliderPos = 0;
  dir = 1;

  logStepStart(`构建开始 (${trigger})`);
  forceRender();
  currentBuildProcess = runHexo(['g', '--incremental']);
}

function fullRebuild() {
  if (isBuilding) abortCurrentBuild();

  isBuilding = true;
  lastBuildFailed = false;
  progressMode = 'bounce';
  sliderWidth = BOUNCE_WIDTH;
  sliderPos = 0;
  dir = 1;

  logStepStart('完整重建 (hexo clean + hexo g)');
  forceRender();

  const clean = spawn('hexo', ['clean'], { cwd: CWD, stdio: ['ignore','pipe','pipe'] });
  currentBuildProcess = clean;
  let cleanOut = '', cleanErr = '';
  clean.stdout.on('data', d => {
    cleanOut += d.toString();
    const lines = cleanOut.split('\n');
    cleanOut = lines.pop();
    lines.forEach(logHexo);
  });
  clean.stderr.on('data', d => {
    cleanErr += d.toString();
    const lines = cleanErr.split('\n');
    cleanErr = lines.pop();
    lines.forEach(logHexo);
  });
  clean.on('close', code => {
    if (cleanOut) logHexo(cleanOut);
    if (cleanErr) logHexo(cleanErr);
    if (currentBuildProcess !== clean) return;
    if (code !== 0) {
      isBuilding = false;
      lastBuildFailed = true;
      logStepEnd('clean 失败，重建中止', false);
      currentBuildProcess = null;
      startFillThenScroll();
      return;
    }
    currentBuildProcess = runHexo(['g']);
  });
  clean.on('error', err => {
    if (currentBuildProcess !== clean) return;
    isBuilding = false;
    lastBuildFailed = true;
    logStepEnd(`clean 错误: ${err.message}`, false);
    currentBuildProcess = null;
    startFillThenScroll();
  });
}

function runHexo(args) {
  const child = spawn('hexo', args, { cwd: CWD, stdio: ['ignore','pipe','pipe'] });
  let outBuf = '', errBuf = '';
  child.stdout.on('data', d => {
    outBuf += d.toString();
    const lines = outBuf.split('\n');
    outBuf = lines.pop();
    lines.forEach(logHexo);
  });
  child.stderr.on('data', d => {
    errBuf += d.toString();
    const lines = errBuf.split('\n');
    errBuf = lines.pop();
    lines.forEach(logHexo);
  });
  child.on('close', code => {
    if (currentBuildProcess !== child) return;
    if (outBuf) logHexo(outBuf);
    if (errBuf) logHexo(errBuf);
    isBuilding = false;
    lastBuildFailed = (code !== 0);
    currentBuildProcess = null;
    if (code === 0) logStepEnd('构建完成', true);
    else logStepEnd(`构建失败，退出码 ${code}`, false);
    startFillThenScroll();
  });
  child.on('error', err => {
    if (currentBuildProcess !== child) return;
    isBuilding = false;
    lastBuildFailed = true;
    currentBuildProcess = null;
    logStepEnd(`构建进程错误: ${err.message}`, false);
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
  setTimeout(() => {
    if (server && !isBuilding) {
      sliderWidth = BOUNCE_WIDTH;
      sliderPos = -sliderWidth;
      progressMode = 'scroll';
    }
  }, FILL_STAY);
}
function scheduleScroll() {
  if (!isBuilding && server && progressMode !== 'scroll') {
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
  const interval = (isBuilding || progressMode === 'fill') ? FRAME_ACTIVE : FRAME_IDLE;
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

// ---------- 首次构建 ----------
function init() {
  printWelcome();
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  scheduleRender();
  logStepStart('首次构建');
  isBuilding = true;
  lastBuildFailed = false;
  progressMode = 'bounce';
  sliderWidth = BOUNCE_WIDTH;
  sliderPos = 0;
  dir = 1;
  forceRender();

  currentBuildProcess = runHexo(['g', '--incremental']);

  if (currentBuildProcess) {
    currentBuildProcess._firstBuild = true;
    const origClose = currentBuildProcess.listeners('close')[0];
    currentBuildProcess.removeAllListeners('close');
    currentBuildProcess.on('close', code => {
      if (currentBuildProcess !== currentBuildProcess) return;
      if (currentBuildProcess._firstBuild) {
        flushLogs();
        if (code === 0) {
          logStepEnd('首次构建完成', true);
          startFillThenScroll();
          startWatcher();
        } else {
          logStepEnd(`首次构建失败，退出码 ${code}`, false);
          process.exit(1);
        }
        isBuilding = false;
        lastBuildFailed = (code !== 0);
        currentBuildProcess = null;
      } else {
        origClose(code);
      }
    });
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', chunk => {
      if (chunk.length === 1) {
        if (chunk[0] === 18) fullRebuild();
        else if (chunk[0] === 3) gracefulExit();
      }
    });
  }
  process.on('SIGINT', gracefulExit);
}

function gracefulExit() {
  process.stdout.write(`\r\x1b[K${RESET}\n`);
  console.log('👋 感谢使用，下次见 (´• ω •`)ﾉ ♪');
  if (renderTimeout) clearTimeout(renderTimeout);
  if (server) server.close();
  if (watcher) watcher.close();
  if (process.stdin.isTTY) { process.stdin.setRawMode(false); process.stdin.pause(); }
  process.exit(0);
}

init();