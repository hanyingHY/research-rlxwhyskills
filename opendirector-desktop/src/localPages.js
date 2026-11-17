/**
 * Local documents served without the Host: the startup placeholder and the
 * fatal-error page. They must not depend on the backend being reachable.
 */

const BASE_STYLE = `
  :root { color-scheme: dark light; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif;
    background: #111214; color: #e8e8ea;
  }
  main { max-width: 520px; padding: 40px; text-align: center; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
  p { margin: 0; color: #a1a1aa; white-space: pre-wrap; }
  .spinner {
    width: 28px; height: 28px; margin: 0 auto 20px; border-radius: 50%;
    border: 3px solid #3f3f46; border-top-color: #e8e8ea;
    animation: spin .9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
`;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function startPage({ locale = "en-US" } = {}) {
  const title = locale.startsWith("zh") ? "正在启动 OpenDirector" : "Starting OpenDirector";
  const body = locale.startsWith("zh")
    ? "正在准备本地服务，这通常只需要几秒钟。"
    : "Preparing the local service. This usually takes a few seconds.";
  return `<!doctype html><html lang="${escapeHtml(locale)}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(title)}</title><style>${BASE_STYLE}</style></head>
<body><main><div class="spinner"></div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></main></body></html>`;
}

export function errorPage({ locale = "en-US", message = "" } = {}) {
  const title = locale.startsWith("zh") ? "OpenDirector 无法启动" : "OpenDirector could not start";
  const hint = locale.startsWith("zh")
    ? "请查看日志或重新启动应用。"
    : "Check the log or restart the application.";
  return `<!doctype html><html lang="${escapeHtml(locale)}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(title)}</title><style>${BASE_STYLE}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message || hint)}</p></main></body></html>`;
}
