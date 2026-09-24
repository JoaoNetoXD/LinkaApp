#!/usr/bin/env node
/**
 * Screenshot the running dev server (npm run dev) with headless Chrome/Edge,
 * without extra dependencies: drives the browser through the DevTools protocol.
 *
 *   node scripts/dev-shot.mjs --path buyer --out shot.png
 *   node scripts/dev-shot.mjs --path seller --role seller --width 1280 --height 800 --out s.png
 *   node scripts/dev-shot.mjs --path buyer --eval "document.querySelector('.product-card').click()" --out d.png
 *
 * Options
 *   --path     hash route to open, e.g. buyer or seller/coupons (default buyer)
 *   --role     none | buyer | seller | admin | superadmin (default buyer). Anything but
 *              "none" injects a local preview session; see getCurrentProfile().
 *   --width/--height  viewport (default 375x812; below 768 emulates a phone)
 *   --eval     JS to run after load; repeat the flag for several steps (600 ms apart)
 *   --wait     ms to wait after load before the steps (default 2500)
 *   --full     capture the full page height
 *   --tour     show the first-run tour
 *   --out      output PNG (default ./dev-shot.png)
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const BASE = args.base || 'http://localhost:5173';
const width = Number(args.width || 375);
const height = Number(args.height || 812);
const out = resolve(args.out || 'dev-shot.png');
// Git Bash rewrites arguments that start with "/" into Windows paths
// ("/buyer" -> "C:/Program Files/Git/buyer"). Accept both "buyer" and "/buyer".
const route = '/' + String(args.path || 'buyer').replace(/^[A-Za-z]:\/.*?\/Git\//, '').replace(/^\/+/, '');

function parseArgs(argv) {
  const result = { eval: [] };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    const next = argv[i + 1];
    if (key === 'full' || key === 'tour') { result[key] = true; continue; }
    if (key === 'eval') { result.eval.push(next); i++; continue; }
    result[key] = next;
    i++;
  }
  return result;
}

function findBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  return candidates.find((p) => existsSync(p));
}

function supabaseStorageKey() {
  try {
    const env = readFileSync('.env', 'utf8');
    const url = env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim() || '';
    const ref = new URL(url).hostname.split('.')[0];
    return `sb-${ref}-auth-token`;
  } catch {
    return 'sb-127-auth-token';
  }
}

function previewSetupScript(role, showTour) {
  const key = supabaseStorageKey();
  return `(() => {
    const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');
    localStorage.clear();
    ${showTour ? '' : "localStorage.setItem('empreende_tour_seen_v1', '1');"}
    localStorage.setItem('empreende_install_prompt_seen_v1', '1');
    if (${JSON.stringify(role)} === 'none') return 'logged-out';
    const exp = Math.floor(Date.now() / 1000) + 31536000;
    const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
      email: 'maria.clara@icev.edu.br', user_metadata: { full_name: 'Maria Clara Souza' }, app_metadata: {} };
    const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: user.id, exp, role: 'authenticated' }) + '.dev';
    localStorage.setItem(${JSON.stringify(key)}, JSON.stringify({ access_token: jwt, refresh_token: 'dev',
      expires_in: 31536000, expires_at: exp, token_type: 'bearer', user }));
    localStorage.setItem('empreende_dev_preview_role', ${JSON.stringify(role)});
    return 'session';
  })()`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = findBrowser();
  if (!browser) throw new Error('Chrome or Edge not found.');
  const profile = mkdtempSync(join(tmpdir(), 'dev-shot-'));
  const proc = spawn(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      await sleep(100);
      const file = join(profile, 'DevToolsActivePort');
      if (existsSync(file)) port = readFileSync(file, 'utf8').split('\n')[0].trim();
    }
    if (!port) throw new Error('Browser did not open a DevTools port.');

    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let nextId = 0;
    const pending = new Map();
    const pageErrors = [];
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        pageErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        pageErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    };
    const send = (method, params = {}) => new Promise((res, rej) => {
      const id = ++nextId;
      pending.set(id, (msg) => (msg.error ? rej(new Error(`${method}: ${msg.error.message}`)) : res(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(`eval failed: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
      return result.result?.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });

    await send('Page.navigate', { url: `${BASE}/` });
    await sleep(800);
    await evaluate(previewSetupScript(args.role || 'buyer', Boolean(args.tour)));
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(100);
    await send('Page.navigate', { url: `${BASE}/${args.tour ? '?tour=1' : ''}#${route}` });
    await sleep(Number(args.wait || 2500));

    for (const step of args.eval) {
      const value = await evaluate(step);
      if (value !== undefined) console.log('eval ->', typeof value === 'string' ? value : JSON.stringify(value));
      await sleep(600);
    }

    let clip;
    if (args.full) {
      const { contentSize } = await send('Page.getLayoutMetrics');
      clip = { x: 0, y: 0, width, height: Math.ceil(contentSize.height), scale: 1 };
    }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: Boolean(clip), ...(clip ? { clip } : {}) });
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    // Network noise from the unreachable local Supabase/API is expected in preview mode.
    const scriptErrors = pageErrors.filter((e) => !/Failed to fetch|ERR_NAME_NOT_RESOLVED|not valid JSON|Erro ao carregar|unavailable|Bad Gateway/i.test(e));
    if (scriptErrors.length) console.log(`page errors:\n  ${[...new Set(scriptErrors)].slice(0, 8).join('\n  ')}`);
    console.log(`saved ${out}`);
    await send('Browser.close').catch(() => {});
  } finally {
    proc.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* profile still locked */ }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
