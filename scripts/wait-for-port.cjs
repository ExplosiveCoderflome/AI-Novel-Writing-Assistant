const net = require("net");

const DEFAULT_HOSTS = ["127.0.0.1", "localhost", "::1"];

function parseHosts(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatEndpoint(host, port) {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

function parseArgs(argv) {
  const options = {
    hosts: process.env.WAIT_FOR_PORT_HOSTS
      ? parseHosts(process.env.WAIT_FOR_PORT_HOSTS)
      : [...DEFAULT_HOSTS],
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
      options.hosts = parseHosts(argv[index + 1]);
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
  console.log("Usage: node scripts/wait-for-port.cjs [--host 127.0.0.1,localhost,::1] [--port 3000] [--timeout 120000] [--interval 500]");
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

  if (!Array.isArray(options.hosts) || options.hosts.length === 0) {
    throw new Error("At least one host is required.");
  }

  const deadline = Date.now() + options.timeoutMs;
  const endpoints = options.hosts.map((host) => formatEndpoint(host, options.port));
  console.log(
    `[wait-for-port] Waiting for ${endpoints.join(", ")} (timeout ${options.timeoutMs}ms)`,
  );

  while (Date.now() < deadline) {
    for (const host of options.hosts) {
      if (await tryConnect(host, options.port)) {
        console.log(`[wait-for-port] ${formatEndpoint(host, options.port)} is ready.`);
        return;
      }
    }

    await wait(options.intervalMs);
  }

  throw new Error(
    `Timed out after ${options.timeoutMs}ms waiting for ${endpoints.join(", ")}`,
  );
}

main().catch((error) => {
  console.error(`[wait-for-port] ${error.message}`);
  process.exit(1);
});
