#!/usr/bin/env node
/**
 * 生成 OG 社交分享图 public/social_share.png（1200×630，OG 标准比例）。
 * 用 HTML 设计稿（战术遥测风格）+ 无头浏览器截图，保证中文标题清晰、品牌与站点一致。
 * 改文案/配色后重跑：node scripts/gen-social.mjs
 */
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function findBrowser() {
  if (process.env.PRERENDER_CHROME && existsSync(process.env.PRERENDER_CHROME)) return process.env.PRERENDER_CHROME;
  const c = [
    '/usr/bin/chromium-browser', '/usr/bin/chromium', '/snap/bin/chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  return c.find((p) => existsSync(p)) || null;
}

const HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:#0A0A0A;color:#EAEAEA;
    font-family:'PingFang SC','Microsoft YaHei','Source Han Sans SC','Noto Sans SC',sans-serif;
    position:relative;overflow:hidden}
  .mono{font-family:'JetBrains Mono',ui-monospace,monospace}
  .grid{position:absolute;inset:0;opacity:.14;
    background-image:linear-gradient(#2A2A2A 1px,transparent 1px),linear-gradient(90deg,#2A2A2A 1px,transparent 1px);
    background-size:48px 48px}
  .wm{position:absolute;right:-30px;bottom:-90px;font-weight:800;font-size:330px;line-height:1;
    color:rgba(234,234,234,.035);letter-spacing:-12px}
  /* 四角角标 */
  .c{position:absolute;width:26px;height:26px;border-color:#E0452E;border-style:solid;border-width:0}
  .tl{top:28px;left:28px;border-top-width:2px;border-left-width:2px}
  .tr{top:28px;right:28px;border-top-width:2px;border-right-width:2px}
  .bl{bottom:28px;left:28px;border-bottom-width:2px;border-left-width:2px}
  .br{bottom:28px;right:28px;border-bottom-width:2px;border-right-width:2px}
  .wrap{position:relative;height:100%;padding:62px 72px;display:flex;flex-direction:column;justify-content:space-between}
  .brand{display:flex;align-items:center;gap:16px}
  .logo{width:54px;height:54px;background:#E0452E;display:flex;align-items:center;justify-content:center;
    font-weight:800;font-size:30px;color:#fff}
  .bn{font-weight:700;font-size:21px;letter-spacing:.18em}
  .bs{font-size:11px;letter-spacing:.28em;color:#6A6A6A;margin-top:3px}
  .eyebrow{display:flex;align-items:center;gap:12px;font-size:13px;letter-spacing:.22em;color:#E0452E;margin-bottom:20px}
  .eyebrow i{display:block;width:42px;height:2px;background:#E0452E}
  h1{font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-2px}
  h1 b{color:#E0452E}
  .sub{font-size:23px;color:#9A9A9A;margin-top:24px;letter-spacing:.01em}
  .foot{display:flex;align-items:center;justify-content:space-between}
  .url{font-size:19px;letter-spacing:.04em;color:#EAEAEA}
  .pill{border:1px solid #E0452E;color:#E0452E;padding:9px 20px;font-size:15px;font-weight:700}
  .live{display:inline-block;width:9px;height:9px;background:#4AF626;margin-right:8px;vertical-align:middle}
</style></head><body>
  <div class="grid"></div>
  <div class="wm mono">RUST+</div>
  <div class="c tl"></div><div class="c tr"></div><div class="c bl"></div><div class="c br"></div>
  <div class="wrap">
    <div class="brand">
      <div class="logo mono">R</div>
      <div><div class="bn mono">RUST+ 控制台</div><div class="bs mono">TACTICAL OPS CONSOLE</div></div>
    </div>
    <div>
      <div class="eyebrow mono"><i></i>REMOTE BASE COMMAND · 远程基地中控</div>
      <h1>离线也能<b>掌控</b>你的基地</h1>
      <div class="sub">实时监控 · 队友追踪 · 设备远程控制 · 基地遭袭即时警报</div>
    </div>
    <div class="foot">
      <div class="url mono"><span class="live"></span>rustplusplus.com</div>
      <div class="pill">注册即享 7 天免费试用</div>
    </div>
  </div>
</body></html>`;

const exe = findBrowser();
if (!exe) { console.error('[social] 未找到 Chrome/Chromium'); process.exit(1); }

const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
await page.setContent(HTML, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600)); // 等字体渲染
mkdirSync(resolve('public'), { recursive: true });
await page.screenshot({ path: resolve('public/social_share.png'), type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log('[social] 已生成 public/social_share.png（1200×630 @2x）');
