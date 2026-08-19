const http = require("http");
const { exec } = require("child_process");
const defaults = require("./defaults");

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const SHUTDOWN_DELAY_MS = 300; // let the HTTP response flush before exiting

const MODE_INFO = {
  run: { label: "run", desc: "기획 -> 디자인 -> 개발 -> 테스트 -> 리뷰 전체 파이프라인을 시작합니다." },
  "find-skills": { label: "find-skills", desc: "이 작업에 쓸 만한 공개 스킬을 찾아줍니다." },
  mcp: { label: "mcp", desc: "설명한 서비스/API에 연결하는 MCP 서버를 만들어줍니다." },
  quick: { label: "quick", desc: "파이프라인이나 스킬 유도 없이, 입력을 그대로 실행합니다." },
};

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {
    /* best-effort; the URL is printed either way */
  });
}

function validateBody(body) {
  const errors = [];
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return ["요청 본문이 올바른 형식이 아닙니다."];
  }
  if (body.defaultExecution != null && !defaults.VALID_EXECUTIONS.has(body.defaultExecution)) {
    errors.push("defaultExecution 값이 올바르지 않습니다.");
  }
  const modes = body.modes || {};
  for (const mode of defaults.MODES) {
    const m = modes[mode] || {};
    if (m.execution != null && !defaults.VALID_EXECUTIONS.has(m.execution)) {
      errors.push(`${mode}의 실행 방식 값이 올바르지 않습니다.`);
    }
    if (m.prompt != null && typeof m.prompt !== "string") {
      errors.push(`${mode}의 프롬프트 값이 문자열이 아닙니다.`);
    }
  }
  return errors;
}

function renderPage() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>hanto 설정</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.5; }
  h1 { font-size: 1.4rem; margin-bottom: 4px; }
  .path { color: #888; font-size: 0.85rem; margin-bottom: 28px; word-break: break-all; }
  section { border: 1px solid #ddd; border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; }
  .switch-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .switch-row p { margin: 4px 0 0; color: #888; font-size: 0.85rem; }
  .toggle { position: relative; display: inline-block; width: 52px; height: 28px; flex-shrink: 0; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle .slider { position: absolute; inset: 0; background: #bbb; border-radius: 28px; cursor: pointer; transition: .2s; }
  .toggle .slider::before { content: ""; position: absolute; height: 22px; width: 22px; left: 3px; top: 3px; background: white; border-radius: 50%; transition: .2s; }
  .toggle input:checked + .slider { background: #2563eb; }
  .toggle input:checked + .slider::before { transform: translateX(24px); }
  .mode-title { display: flex; align-items: baseline; gap: 10px; }
  .mode-title code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9rem; }
  .mode-desc { color: #888; font-size: 0.85rem; margin: 4px 0 12px; }
  select { padding: 4px 8px; border-radius: 6px; }
  label.custom-toggle { display: flex; align-items: center; gap: 8px; margin: 10px 0 6px; font-size: 0.9rem; cursor: pointer; }
  textarea { width: 100%; box-sizing: border-box; min-height: 90px; font-family: ui-monospace, monospace; font-size: 0.85rem; padding: 8px; border-radius: 6px; border: 1px solid #ccc; }
  .hint { color: #888; font-size: 0.78rem; margin-top: 4px; }
  .reset-btn { font-size: 0.78rem; background: none; border: none; color: #2563eb; cursor: pointer; padding: 0; margin-left: 8px; }
  .actions { display: flex; gap: 10px; margin-top: 24px; }
  button.primary { background: #2563eb; color: white; border: none; border-radius: 8px; padding: 10px 20px; font-size: 0.95rem; cursor: pointer; }
  button.secondary { background: none; border: 1px solid #ccc; border-radius: 8px; padding: 10px 20px; font-size: 0.95rem; cursor: pointer; }
  #status { margin-top: 14px; font-size: 0.9rem; }
</style>
</head>
<body>
  <h1>hanto 설정</h1>
  <div class="path" id="config-path">불러오는 중...</div>

  <section>
    <div class="switch-row">
      <div>
        <strong id="global-label">기본 실행 방식</strong>
        <p id="global-desc">대화형: Claude와 대화하며 진행 / 자동 실행: 결과만 출력하고 끝냅니다.</p>
      </div>
      <label class="toggle">
        <input type="checkbox" id="global-toggle">
        <span class="slider"></span>
      </label>
    </div>
  </section>

  <div id="mode-cards"></div>

  <div class="actions">
    <button class="primary" id="save-btn">저장</button>
    <button class="secondary" id="close-btn">저장 안 하고 닫기</button>
  </div>
  <div id="status"></div>

<script>
const MODES = ${JSON.stringify(defaults.MODES)};
const MODE_INFO = ${JSON.stringify(MODE_INFO)};
let state = null; // { current, builtin, configPath }

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const child of children || []) node.appendChild(child);
  return node;
}

function renderModeCard(mode) {
  const info = MODE_INFO[mode];
  const current = state.current.modes[mode];
  const builtinPrompt = state.builtin[mode];
  const hasCustom = current.prompt != null;

  const section = el("section", {});
  section.appendChild(el("div", { class: "mode-title" }, [
    el("code", { text: info.label }),
  ]));
  section.appendChild(el("div", { class: "mode-desc", text: info.desc }));

  const execRow = el("div", {});
  execRow.appendChild(el("span", { text: "실행 방식: " }));
  const select = el("select", { "data-mode": mode, "data-role": "execution" });
  const options = [["", "기본값 따름"], ["interactive", "대화형"], ["headless", "자동 실행"]];
  for (const [value, label] of options) {
    const opt = el("option", { value }, []);
    opt.textContent = label;
    if ((current.execution || "") === value) opt.selected = true;
    select.appendChild(opt);
  }
  execRow.appendChild(select);
  section.appendChild(execRow);

  const customLabel = el("label", { class: "custom-toggle" });
  const customCheckbox = el("input", { type: "checkbox", "data-mode": mode, "data-role": "custom-enabled" });
  customCheckbox.checked = hasCustom;
  customLabel.appendChild(customCheckbox);
  customLabel.appendChild(document.createTextNode("커스텀 프롬프트 사용"));
  section.appendChild(customLabel);

  const textarea = el("textarea", { "data-mode": mode, "data-role": "prompt" });
  textarea.value = hasCustom ? current.prompt : builtinPrompt;
  textarea.disabled = !hasCustom;
  section.appendChild(textarea);

  const resetBtn = el("button", { class: "reset-btn", type: "button", text: "기본값으로 되돌리기" });
  resetBtn.addEventListener("click", () => {
    textarea.value = builtinPrompt;
  });
  section.appendChild(resetBtn);

  const hint = mode === "run"
    ? "사용 가능한 자리표시자: {slug}, {input}"
    : "사용 가능한 자리표시자: {input}";
  section.appendChild(el("div", { class: "hint", text: hint }));

  customCheckbox.addEventListener("change", () => {
    textarea.disabled = !customCheckbox.checked;
  });

  return section;
}

function renderAll() {
  document.getElementById("config-path").textContent = "저장 위치: " + state.configPath;
  document.getElementById("global-toggle").checked = state.current.defaultExecution === "headless";

  const container = document.getElementById("mode-cards");
  container.innerHTML = "";
  for (const mode of MODES) container.appendChild(renderModeCard(mode));
}

function collectPayload() {
  const payload = {
    defaultExecution: document.getElementById("global-toggle").checked ? "headless" : "interactive",
    modes: {},
  };
  for (const mode of MODES) {
    const execSelect = document.querySelector('select[data-mode="' + mode + '"][data-role="execution"]');
    const customCheckbox = document.querySelector('input[data-mode="' + mode + '"][data-role="custom-enabled"]');
    const textarea = document.querySelector('textarea[data-mode="' + mode + '"]');
    const execValue = execSelect.value || null;

    let promptValue = null;
    if (customCheckbox.checked) {
      const trimmed = textarea.value.trim();
      if (trimmed !== "" && trimmed !== state.builtin[mode].trim()) {
        promptValue = textarea.value;
      }
    }
    payload.modes[mode] = { execution: execValue, prompt: promptValue };
  }
  return payload;
}

async function load() {
  const res = await fetch("/api/config");
  state = await res.json();
  renderAll();
}

document.getElementById("save-btn").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "저장 중...";
  const res = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collectPayload()),
  });
  if (res.ok) {
    status.textContent = "저장 완료 - 이 창을 닫아도 됩니다.";
  } else {
    const body = await res.json().catch(() => ({}));
    status.textContent = "저장 실패: " + (body.errors ? body.errors.join(", ") : "알 수 없는 오류");
  }
});

document.getElementById("close-btn").addEventListener("click", async () => {
  document.getElementById("status").textContent = "저장하지 않고 닫았습니다. 이 창을 닫아도 됩니다.";
  await fetch("/api/quit", { method: "POST" });
});

load();
</script>
</body>
</html>`;
}

function startConfigServer(cwd) {
  let idleTimer;
  let expectedOrigin = null; // set once the server knows its own port

  // Blocks cross-origin POSTs from other browser tabs (CSRF) while still
  // allowing non-browser callers (curl, scripts) that send no Origin header
  // at all - a real browser always sends Origin on a cross-origin fetch.
  function isAllowedOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    return origin === expectedOrigin;
  }

  function scheduleShutdown(delayMs) {
    setTimeout(() => {
      server.close(() => process.exit(0));
    }, delayMs).unref();
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      console.log("[hanto] Config UI idle timeout reached - closing.");
      server.close(() => process.exit(0));
    }, IDLE_TIMEOUT_MS);
  }

  const server = http.createServer((req, res) => {
    resetIdleTimer();

    if (req.method === "POST" && !isAllowedOrigin(req)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, errors: ["잘못된 출처(origin)의 요청입니다."] }));
      return;
    }

    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderPage());
      return;
    }

    if (req.method === "GET" && req.url === "/api/config") {
      const current = defaults.loadConfig(cwd);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ current, builtin: defaults.BUILTIN_PROMPTS, configPath: defaults.configPath(cwd) }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/config") {
      let raw = "";
      req.on("error", (err) => {
        console.error(`[hanto] Request aborted before it finished: ${err.message}`);
      });
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        let body;
        try {
          body = JSON.parse(raw);
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, errors: ["요청 본문이 올바른 JSON이 아닙니다."] }));
          return;
        }

        const errors = validateBody(body);
        if (errors.length > 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, errors }));
          return;
        }

        const merged = defaults.mergeConfig(defaults.defaultConfig(), body);
        try {
          defaults.saveConfig(cwd, merged);
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, errors: [`저장 실패: ${err.message}`] }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, saved: merged }));
        console.log(`[hanto] Saved ${defaults.configPath(cwd)}`);
        scheduleShutdown(SHUTDOWN_DELAY_MS);
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/quit") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      scheduleShutdown(SHUTDOWN_DELAY_MS);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}/`;
    expectedOrigin = `http://127.0.0.1:${port}`;
    console.log(`[hanto] Config UI: ${url}`);
    console.log("[hanto] Opening in your browser (Ctrl+C to cancel)...");
    openBrowser(url);
    resetIdleTimer();
  });

  server.on("error", (err) => {
    console.error(`[hanto] Could not start the config server: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { startConfigServer, validateBody, renderPage };
