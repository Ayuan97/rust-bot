import { useEffect } from 'react';

// 站点根地址（canonical 用）
const SITE = 'https://www.rustplusplus.com';

/**
 * 轻量 SEO：在客户端为每个页面设置 title / description / canonical。
 * 无需额外依赖；未做预渲染时主要服务于浏览器标签标题、社媒抓取与能执行 JS 的爬虫。
 * 用法：useSEO({ title: '...', description: '...', path: '/demo' })
 */
export default function useSEO({ title, description, path } = {}) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) upsertMeta('description', description);
    if (path != null) upsertCanonical(`${SITE}${path}`);
  }, [title, description, path]);
}

function upsertMeta(name, content) {
  let el = document.head.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}
