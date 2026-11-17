/** Shared look for the two windows the shell itself renders.
 *
 * Both reuse the workspace palette (`#0c0c0e` / `#e8e1ed`) and font stack so the
 * startup window and the app window feel like one application rather than a
 * loader bolted onto a website. */

export const SHELL_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function shellStyles(): string {
  return `
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      background: #0c0c0e;
      color: #e8e1ed;
      font-family: ${SHELL_FONT_STACK};
      font-size: 14px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
    }
    .shell { display: flex; flex-direction: column; height: 100%; padding: 28px 32px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .mark {
      width: 34px; height: 34px; border-radius: 9px; flex: none;
      background: linear-gradient(140deg, #6d5efc, #b06bf5 55%, #f078c6);
      box-shadow: 0 6px 18px rgba(120, 90, 240, 0.35);
    }
    .title { font-size: 16px; font-weight: 600; letter-spacing: 0.2px; }
    .subtitle { font-size: 12px; opacity: 0.6; }
    .body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 14px; }
    .stage { font-size: 14px; }
    .detail { font-size: 12px; opacity: 0.55; word-break: break-all; }
    .bar { height: 3px; border-radius: 2px; background: rgba(232, 225, 237, 0.12); overflow: hidden; }
    .bar > i {
      display: block; height: 100%; width: 38%; border-radius: 2px;
      background: linear-gradient(90deg, #6d5efc, #f078c6);
      animation: slide 1.4s ease-in-out infinite;
    }
    @keyframes slide {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(320%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .bar > i { animation: none; width: 100%; opacity: 0.5; }
    }
    .hint { font-size: 12px; opacity: 0.45; }
  `;
}

export function shellDocument(title: string, body: string, extraStyles = ""): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
    <title>${escapeHtml(title)}</title>
    <style>${shellStyles()}${extraStyles}</style>
  </head>
  <body>${body}</body>
</html>`;
}
