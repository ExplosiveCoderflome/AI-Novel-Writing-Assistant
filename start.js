// 启动应用的入口文件
const { spawn } = require('child_process');
const path = require('path');

// 获取当前目录
const currentDir = __dirname;

// 启动服务器
const serverProcess = spawn('node', [path.join(currentDir, 'server', 'dist', 'app.js')], {
  cwd: currentDir,
  stdio: 'inherit'
});

// 启动客户端
const clientProcess = spawn('npx', ['vite', 'preview', '--port', '5173'], {
  cwd: path.join(currentDir, 'client'),
  stdio: 'inherit'
});

// 处理进程退出
function handleExit(signal) {
  console.log(`收到 ${signal} 信号，正在关闭应用...`);
  serverProcess.kill();
  clientProcess.kill();
  process.exit(0);
}

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);