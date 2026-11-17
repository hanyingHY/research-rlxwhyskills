# Issue #362 评论草稿

下面是一份可直接贴到 issue 的英文评论（按维护者的写作风格，先给结论，再给可执行项）。
中文要点在后半部分，供你按需要增删。

---

## English draft

> I went through the current `main` and prototyped the Host + Electron lifecycle to see
> where the RFC meets the existing code. The direction is right, and Electron is the
> correct choice: MP4 export runs through WebCodecs in the renderer, so a WebView with
> inconsistent H.264 encoder support (WKWebView/WebKitGTK) would put a core acceptance
> item at risk.
>
> Six things need a decision before D1–D4 run in parallel, because they change the
> implementation rather than the packaging:
>
> 1. **Per-launch authentication.** Today `local_requests` only checks hostname, `Origin`
>    and `X-OpenDirector-Request: 1`; any local process can forge the last one. The
>    desktop Host should generate a 256-bit token in the main process, require
>    `Authorization: Bearer` on every `/api/*` route, and let the shell inject it while
>    proxying. Use a pure ASGI middleware, not `BaseHTTPMiddleware`: the image-selection
>    preview relies on the browser disconnect event, which a buffering middleware hides.
>
> 2. **Stable renderer origin.** `localStorage` (theme, locale, drafts) and Web Locks are
>    scoped by origin, and the Host port is OS-assigned. Loading `http://127.0.0.1:<port>`
>    directly means a new origin on every launch: preferences look lost and stale session
>    leases behave differently. A fixed `app://`-style scheme proxied by the main process
>    keeps one origin and avoids localhost cookies. This also needs streamed responses,
>    Range requests and downloads to pass through unchanged.
>
> 3. **Task-aware quit.** `agent.active` is a closure in `agent.py`, tool tasks are
>    queryable per project, generation jobs live in the project snapshot, and export only
>    exists in the renderer. A single `GET /api/desktop/status` returning active turns,
>    tool tasks, running jobs and reported export sessions would make the quit prompt
>    honest. Otherwise the shell either warns every time or silently interrupts work.
>
> 4. **Data root.** A wheel install defaults to `~/.opendirector`, a source checkout
>    defaults to the repository, and `OPENDIRECTOR_ROOT` overrides both. The desktop app
>    should default to the same root as the wheel CLI and show it in diagnostics;
>    otherwise users will report that their CLI projects disappeared.
>
> 5. **Runtime size and licensing.** `opencode-ai@1.19.5` ships ~180–215 MB of platform
>    binary per target, and FFmpeg with `libx264` is GPL. Together with Electron and
>    CPython this is roughly a 500–700 MB installed payload. Please decide between
>    bundling everything for offline use, and downloading the agent runtime on first use.
>    The FFmpeg licence choice also affects the installer and NOTICE.
>
> 6. **Linux updates.** `electron-updater` reliably supports AppImage only; deb/rpm are
>    not auto-updated. D4/D5 should either promise AppImage updates only, or budget for a
>    repository-based channel.
>
> Two smaller notes:
>
> - Keep the desktop/shell version identical to the bundled OpenDirector version (one
>   release unit). The repository already forbids floating tags, so attaching installers
>   to the existing SemVer GitHub Release fits the current policy.
> - HarmonyOS cannot share an Electron runtime. #252 is probably best scoped as an
>   independent client that shares the Web UI and HTTP contract, not this build matrix.
>
> I have a working skeleton that exercises the first three items on Linux against the
> real backend: OS-assigned port, token-enforced `/api`, `shutdown` over a JSONL control
> channel, graceful lifespan shutdown, and a proxy that keeps a single origin. It is a
> prototype, not a PR, but the lifecycle tests and the packaged-runtime verification
> script may be useful as a starting point for D1.

---

## 中文要点（发帖时可留作说明）

- 方向与选型认可：Electron 是导出能力决定的，不是偏好。
- D1 前必须先冻结 6 件事：鉴权、稳定 origin、任务状态、数据根、运行时体积/许可证、
  Linux 更新范围。
- 补充两点：版本号与发布单元统一；HarmonyOS 独立。
- 已有一个可跑的骨架验证了前三点，可作为 D1 起点。
