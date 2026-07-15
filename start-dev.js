#!/usr/bin/env node

/**
 * LoopMarshal 开发环境启动脚本
 * 同时启动前端和后端
 */

const { spawn } = require('child_process');
const path = require('path');

// 颜色定义
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// 日志函数
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.cyan}🚀${colors.reset} ${msg}`),
};

console.log('');
console.log(`${colors.blue}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.blue}║${colors.reset}  ${colors.cyan}🚀 LoopMarshal - 开发环境启动${colors.reset}                              ${colors.blue}║${colors.reset}`);
console.log`${colors.blue}╚═══════════════════════════════════════════════════════════╝${colors.reset}`;
console.log('');

// 启动后端
log.step('启动后端服务...');
const cliDir = path.join(__dirname, 'apps', 'cli');
const backend = spawn('pnpm', ['dev'], {
  cwd: cliDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true,
});

backend.stdout.on('data', (data) => {
  const msg = data.toString().trim();
  if (msg) {
    console.log(`${colors.magenta}[后端]${colors.reset} ${msg}`);
  }
});

backend.stderr.on('data', (data) => {
  const msg = data.toString().trim();
  if (msg) {
    console.log(`${colors.magenta}[后端]${colors.reset} ${msg}`);
  }
});

backend.on('error', (err) => {
  log.error(`后端启动失败: ${err.message}`);
});

// 等待后端启动
setTimeout(() => {
  // 启动前端
  log.step('启动前端服务...');
  const webDir = path.join(__dirname, 'apps', 'web');
  const frontend = spawn('pnpm', ['dev'], {
    cwd: webDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
  });

  frontend.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      console.log(`${colors.cyan}[前端]${colors.reset} ${msg}`);
    }
  });

  frontend.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      console.log(`${colors.cyan}[前端]${colors.reset} ${msg}`);
    }
  });

  frontend.on('error', (err) => {
    log.error(`前端启动失败: ${err.message}`);
  });

  console.log('');
  console.log(`${colors.green}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.green}║${colors.reset}  ${colors.cyan}✅ LoopMarshal 启动成功！${colors.reset}                                  ${colors.green}║${colors.reset}`);
  console.log(`${colors.green}╠═══════════════════════════════════════════════════════════╣${colors.reset}`);
  console.log(`${colors.green}║${colors.reset}  ${colors.blue}📱 前端地址:${colors.reset} http://localhost:5173                      ${colors.green}║${colors.reset}`);
  console.log(`${colors.green}║${colors.reset}  ${colors.blue}🔌 后端地址:${colors.reset} http://127.0.0.1:42688                     ${colors.green}║${colors.reset}`);
  console.log(`${colors.green}║${colors.reset}  ${colors.blue}🔗 WebSocket:${colors.reset} ws://127.0.0.1:42688                      ${colors.green}║${colors.reset}`);
  console.log(`${colors.green}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`${colors.yellow}按 Ctrl+C 停止所有服务${colors.reset}`);
  console.log('');

  // 捕获退出信号
  process.on('SIGINT', () => {
    console.log('');
    log.step('正在停止服务...');
    backend.kill();
    frontend.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('');
    log.step('正在停止服务...');
    backend.kill();
    frontend.kill();
    process.exit(0);
  });

}, 3000); // 等待 3 秒让后端启动
