export const EDGE_EXTENSION_URL =
  'https://microsoftedge.microsoft.com/addons/detail/rust-credentials-helper/cbfnmldjlldpknjbfcmmlgfbakofhcil';

// Chrome 商店版未上架前的手动安装：下载插件包 + 图文教程页（均为前端 public 静态资源）
export const CHROME_EXTENSION_DOWNLOAD = '/rust-credentials-helper.zip';
export const CHROME_INSTALL_GUIDE = '/chrome-install.html';

export const STEAM_LOGIN_URL = 'https://companion-rust.facepunch.com/login';

export const REQUIRED_PLUGIN_BROWSER = 'Microsoft Edge';

export function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('Chrome/')) return 'chrome';
  if (ua.includes('Firefox/')) return 'firefox';
  if (ua.includes('Safari/')) return 'safari';
  return 'unknown';
}

export function isEdgeBrowser(browserType) {
  return browserType === 'edge';
}
