const net = require("net");

function parseArgs(argv) {
  const options = {
    host: "127.0.0.1",
    port: 3000,
    timeoutMs: 120000,
    intervalMs: 500,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--host" && argv[index + 1]) {
      options.host = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--port" && argv[index + 1]) {
      options.port = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--timeout" && argv[index + 1]) {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--interval" && argv[index + 1]) {
      options.intervalMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return options;
}

function printHelp() {
  console.log("Usage: node scripts/wait-for-port.cjs [--host 127.0.0.1] [--port 3000] [--timeout 120000] [--interval 500]");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const finish = (connected) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(connected);
    };

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!Number.isInteger(options.port) || options.port <= 0 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }

  const deadline = Date.now() + options.timeoutMs;
  console.log(
    `[wait-for-port] Waiting for ${options.host}:${options.port} (timeout ${options.timeoutMs}ms)`,
  );

  while (Date.now() < deadline) {
    if (await tryConnect(options.host, options.port)) {
      console.log(`[wait-for-port] ${options.host}:${options.port} is ready.`);
      return;
    }

    await wait(options.intervalMs);
  }

  throw new Error(
    `Timed out after ${options.timeoutMs}ms waiting for ${options.host}:${options.port}`,
  );
}

main().catch((error) => {
  console.error(`[wait-for-port] ${error.message}`);
  process.exit(1);
});
