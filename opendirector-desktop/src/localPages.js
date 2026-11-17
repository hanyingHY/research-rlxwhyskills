/**
 * Local documents served without the Host: the startup placeholder and the
 * fatal-error page. They must not depend on the backend being reachable, so
 * they carry their own styles and no scripts.
 */

const BASE_STYLE = `
  :root { color-scheme: dark light; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif;
    background: #111214; color: #ececee;
    -webkit-font-smoothing: antialiased;
  }
  .halo {
    position: fixed; inset: -20%; pointer-events: none;
    background: radial-gradient(circle at 50% 38%, rgba(245,181,74,.10), transparent 55%),
                radial-gradient(circle at 50% 70%, rgba(45,212,191,.06), transparent 60%);
  }
  main { position: relative; width: min(460px, 82vw); text-align: center; }
  .mark { width: 72px; height: 72px; margin: 0 auto 22px; display: block; filter: drop-shadow(0 10px 24px rgba(0,0,0,.45)); }
  h1 { font-size: 17px; font-weight: 600; margin: 0 0 6px; letter-spacing: -.01em; }
  p { margin: 0; color: #a1a1aa; white-space: pre-wrap; font-size: 13px; }
  .steps { margin-top: 26px; height: 20px; position: relative; }
  .steps span {
    position: absolute; inset: 0; opacity: 0;
    font-size: 12px; color: #8b8b93; letter-spacing: .02em;
    animation: stage 9s infinite;
  }
  .steps span:nth-child(2) { animation-delay: 3s; }
  .steps span:nth-child(3) { animation-delay: 6s; }
  .bar { margin: 14px auto 0; width: 180px; height: 3px; border-radius: 3px; background: #26262b; overflow: hidden; }
  .bar i {
    display: block; height: 100%; width: 38%; border-radius: 3px;
    background: linear-gradient(90deg, #f5b54a, #f8d38a);
    animation: slide 1.6s ease-in-out infinite;
  }
  .version { margin-top: 28px; font-size: 11px; color: #5f5f67; letter-spacing: .04em; }
  .error { text-align: left; }
  .error h1 { font-size: 18px; }
  .error pre {
    margin-top: 14px; padding: 12px 14px; border-radius: 10px;
    background: #191a1e; border: 1px solid #2a2a30; color: #c9c9cf;
    font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: pre-wrap; word-break: break-word; max-height: 40vh; overflow: auto;
  }
  .hint { margin-top: 14px; font-size: 12px; color: #77777f; }
  @keyframes stage {
    0%, 2% { opacity: 0; } 6%, 28% { opacity: 1; } 33%, 100% { opacity: 0; }
  }
  @keyframes slide {
    0% { transform: translateX(-120%); } 100% { transform: translateX(360%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar, .steps { display: none; } .steps span { animation: none; opacity: 1; position: static; }
  }
`;

const MARK = `<svg class="mark" viewBox="0 0 96 96" aria-hidden="true">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#232530"/><stop offset="1" stop-color="#141519"/>
    </linearGradient>
    <linearGradient id="a" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f8c667"/><stop offset="1" stop-color="#eda43a"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="92" height="92" rx="22" fill="url(#g)" stroke="rgba(255,255,255,.08)"/>
  <path d="M20 34 L44 27 V38 L20 45 Z" fill="url(#a)"/>
  <path d="M20 47 L44 40 V51 L20 58 Z" fill="url(#a)"/>
  <path d="M20 60 L44 53 V64 L20 71 Z" fill="url(#a)" opacity=".85"/>
  <path d="M55 32 L78 48 L55 64 Z" fill="url(#a)"/>
  <circle cx="30" cy="22" r="3" fill="#2dd4bf"/><circle cx="31" cy="79" r="2.5" fill="#2dd4bf" opacity=".75"/>
  <circle cx="86" cy="30" r="2.5" fill="#2dd4bf" opacity=".7"/>
  <path d="M30 22 L86 30 L31 79 Z" fill="none" stroke="rgba(45,212,191,.35)" stroke-width="1"/>
</svg>`;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function shell({ locale, title, body, extra = "", cls = "", version = "" }) {
  return `<!doctype html><html lang="${escapeHtml(locale)}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(title)}</title><style>${BASE_STYLE}</style></head>
<body><div class="halo"></div><main class="${cls}">
${MARK}
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
${extra}
${version ? `<div class="version">OpenDirector ${escapeHtml(version)}</div>` : ""}
</main></body></html>`;
}

export function startPage({ locale = "en-US", version = "" } = {}) {
  const zh = locale.startsWith("zh");
  const steps = zh
    ? ["正在启动本地服务…", "正在检查运行时…", "正在加载创作画布…"]
    : ["Starting the local service…", "Checking the runtime…", "Loading the creation canvas…"];
  const extra = `<div class="steps">${steps
    .map((step) => `<span>${escapeHtml(step)}</span>`)
    .join("")}</div><div class="bar"><i></i></div>`;
  return shell({
    locale,
    title: zh ? "正在启动 OpenDirector" : "Starting OpenDirector",
    body: zh
      ? "第一次启动需要准备本地服务，通常几秒钟；无需联网。"
      : "The first launch prepares the local service. Usually a few seconds, no network needed.",
    extra,
    version,
  });
}

export function errorPage({ locale = "en-US", message = "", version = "" } = {}) {
  const zh = locale.startsWith("zh");
  const title = zh ? "OpenDirector 无法启动" : "OpenDirector could not start";
  const hint = zh
    ? "打开「帮助 → 打开日志目录」查看 desktop.log 与 host.log，或重新启动应用。"
    : "Open Help → Open Log Folder to read desktop.log and host.log, or restart the app.";
  const detail = message
    ? `<pre>${escapeHtml(message)}</pre>`
    : `<p class="hint">${escapeHtml(zh ? "本地服务没有就绪。" : "The local service is not ready.")}</p>`;
  return shell({
    locale,
    title,
    body: zh
      ? "本地服务未能启动。你的项目和素材没有被改动。"
      : "The local service did not start. Your projects and assets were not changed.",
    extra: `${detail}<p class="hint">${escapeHtml(hint)}</p>`,
    cls: "error",
    version,
  });
}
