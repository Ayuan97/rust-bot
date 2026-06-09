#!/usr/bin/env node
/**
 * 预渲染公开页为静态 HTML（SEO）。
 *
 * vite build 之后执行：起一个极简静态服务器 serve dist（SPA fallback），
 * 用无头浏览器渲染每个公开路由，把渲染后的完整 HTML（含正文 + useSEO 设的 title/description/canonical）
 * 写回 dist，使爬虫（尤其百度，不执行 JS）也能直接抓到正文与每页独立的 meta。
 *
 * 强容错：找不到浏览器 / 启动失败 / 单页超时，都只告警、不阻断构建（退回普通 SPA）。
 * 用 puppeteer-core + 系统 Chromium（不在 npm install 时下载 chromium，避免拖慢/卡住部署）。
 *   - 浏览器路径可用环境变量 PRERENDER_CHROME 覆盖。
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');
const PORT = 4271;
// 需要被搜索引擎收录的公开页（与 sitemap.xml 对应）
const ROUTES = ['/', '/demo', '/privacy'];

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain', '.xml': 'application/xml',
};

function findBrowser() {
  if (process.env.PRERENDER_CHROME && existsSync(process.env.PRERENDER_CHROME)) {
    return process.env.PRERENDER_CHROME;
  }
  const candidates = [
    '/usr/bin/chromium-browser', '/usr/bin/chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/snap/bin/chromium',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

function startServer() {
  const index = readFileSync(join(DIST, 'index.html'));
  return new Promise((res) => {
    const server = createServer((req, rs) => {
      const path = decodeURIComponent((req.url || '/').split('?')[0]);
      const file = join(DIST, path);
      // 有扩展名且文件存在 → 直接返回静态资源；否则 SPA fallback 到 index.html
      if (extname(file) && existsSync(file)) {
        rs.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
        rs.end(readFileSync(file));
      } else {
        rs.setHeader('Content-Type', 'text/html');
        rs.end(index);
      }
    });
    server.listen(PORT, () => res(server));
  });
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.warn('[prerender] dist/index.html 不存在，跳过');
    return;
  }
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer-core')).default;
  } catch {
    console.warn('[prerender] 未安装 puppeteer-core，跳过预渲染（退回普通 SPA，不影响构建）');
    return;
  }
  const executablePath = findBrowser();
  if (!executablePath) {
    console.warn('[prerender] 未找到 Chromium/Chrome，跳过预渲染（退回普通 SPA）');
    return;
  }
  console.log(`[prerender] 使用浏览器: ${executablePath}`);

  const server = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (e) {
    console.warn(`[prerender] 浏览器启动失败，跳过（不影响构建）: ${e.message}`);
    server.close();
    return;
  }

  let ok = 0;
  for (const route of ROUTES) {
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForSelector('#root > *', { timeout: 12000 });
      await new Promise((r) => setTimeout(r, 400)); // 给 useSEO / 异步渲染留一帧
      const html = await page.content();
      const outDir = route === '/' ? DIST : join(DIST, route.replace(/^\//, ''));
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'index.html'), html);
      await page.close();
      ok++;
      console.log(`[prerender] ✓ ${route}`);
    } catch (e) {
      console.warn(`[prerender] ✗ ${route}: ${e.message}`);
    }
  }
  await browser.close();
  server.close();
  console.log(`[prerender] 完成：${ok}/${ROUTES.length} 页`);
}

main().catch((e) => {
  console.warn('[prerender] 异常（已忽略，不阻断构建）:', e.message);
});
