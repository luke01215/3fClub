// Full-page screenshots via the Chrome DevTools Protocol.
// Chrome's --screenshot flag only captures the viewport; captureBeyondViewport
// gets the whole scrollable page. No dependencies - Node's global WebSocket.

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const WIDTH = 1440;
const OUT = process.argv[2];
const PAGES = process.argv.slice(3);

const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
  '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  // Keep Chrome's profile in the temp dir - it is ~100MB and must not land
  // next to the screenshots.
  '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), '3f-shot-')),
  'about:blank'
], { stdio: 'ignore' });

async function waitForChrome() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch {}
    await sleep(300);
  }
  throw new Error('Chrome did not expose a debugging port');
}

/** Minimal CDP client over one target's websocket. */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      listeners.get(msg.method).forEach(fn => fn(msg.params));
    }
  });

  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });

  return {
    ready,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
    },
    close() { ws.close(); }
  };
}

async function capture(file) {
  const url = 'file:///' + path.resolve(file).replace(/\\/g, '/');
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const target = await res.json();

  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;

  let loaded = false;
  cdp.on('Page.loadEventFired', () => { loaded = true; });
  await cdp.send('Page.enable');

  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url });

  for (let i = 0; i < 60 && !loaded; i++) await sleep(150);
  // Let webfonts settle and the canvas bootstraps finish their retry schedule.
  await sleep(3500);

  const { cssContentSize } = await cdp.send('Page.getLayoutMetrics');
  const height = Math.min(Math.ceil(cssContentSize.height), 16000);

  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: WIDTH, height, scale: 1 }
  });

  const name = path.basename(file).replace(/\.html$/, '') + '-full.png';
  const dest = path.join(OUT, name);
  fs.writeFileSync(dest, Buffer.from(data, 'base64'));

  cdp.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);

  return { name, height, bytes: fs.statSync(dest).size };
}

try {
  await waitForChrome();
  for (const p of PAGES) {
    const r = await capture(p);
    console.log(`${r.name.padEnd(30)} ${String(r.height).padStart(6)}px  ${(r.bytes / 1024).toFixed(0)} KB`);
  }
} finally {
  chrome.kill();
}
