// 安卓端入口：设置运行环境后启动打包后的 server bundle
process.env.NODE_PATH = __dirname;
process.env.AI_NOVEL_RUNTIME = process.env.AI_NOVEL_RUNTIME || 'web';
process.env.AI_NOVEL_DATABASE_MODE = process.env.AI_NOVEL_DATABASE_MODE || 'sqlite';
process.env.PORT = process.env.PORT || '3000';
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.AI_NOVEL_APP_DATA_DIR = __dirname;

const server = require('./bundle.cjs');
// 安卓/web 模式由 NodeService 提前用 init-db.cjs 建表，这里直接启动监听
server.startServer().catch((error) => {
  console.error('[server] bootstrap failed.', error);
  process.exit(1);
});
