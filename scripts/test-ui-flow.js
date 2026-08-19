/**
 * UI/UX Automated Navigation Test & Flow Verification Script
 * Maintains reusable navigation flow configurations and automated check steps.
 */
const http = require('http');

const CONFIG = {
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  serverUrl: process.env.SERVER_URL || 'http://localhost:3000',
  routes: [
    { name: 'Home / Shelf', path: '/' },
    { name: 'Simple Creation Mode', path: '/novels/simple' },
    { name: 'Help Page', path: '/help' },
  ],
};

function checkPort(urlStr) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const req = http.get({ host: url.hostname, port: url.port, path: '/' }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function runUiVerification() {
  console.log('[UI-Test-Runner] Checking frontend & backend dev servers...');
  const serverOk = await checkPort(CONFIG.serverUrl);
  const clientOk = await checkPort(CONFIG.clientUrl);

  console.log(`[UI-Test-Runner] Backend (${CONFIG.serverUrl}): ${serverOk ? 'ONLINE' : 'OFFLINE'}`);
  console.log(`[UI-Test-Runner] Frontend (${CONFIG.clientUrl}): ${clientOk ? 'ONLINE' : 'OFFLINE'}`);

  if (!clientOk) {
    console.log('[UI-Test-Runner] Note: Frontend dev server needs to be launched for browser verification.');
  }

  return { serverOk, clientOk, routes: CONFIG.routes };
}

if (require.main === module) {
  runUiVerification().then((res) => {
    console.log('[UI-Test-Runner] Configuration & Navigation Routes Ready:', res.routes.map(r => r.name).join(', '));
  });
}

module.exports = { runUiVerification, CONFIG };
