export const EDGE_EXTENSION_URL =
  'https://microsoftedge.microsoft.com/addons/detail/rust-credentials-helper/cbfnmldjlldpknjbfcmmlgfbakofhcil';

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
