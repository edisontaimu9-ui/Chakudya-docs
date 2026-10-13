/**
 * Chakudya NutriMind - nutrition assistant page ("#/nutrimind").
 * Calls the public POST /rag/ask route (no API key in the browser) and shows the
 * grounded answer with its sources. Chat history stays in this browser only.
 */
const RenderNutriMind = (() => {
  const STORE = "cnr.nutrimind.v1";
  const MAX_Q = 600;
  const MAX_SAVED = 40;
  const PROMPTS = [
    "How many calories are in nsima?",
    "Which Malawian foods are rich in iron?",
    "What foods should I limit on a kidney-friendly diet?",
    "Compare groundnuts and soya pieces for protein",
  ];
  const MODES = [
    ["both", "All"],
    ["general", "Everyday"],
    ["clinical", "Clinical"],
  ];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function newId() {
    const a = new Uint8Array(12);
    (window.crypto || {}).getRandomValues?.(a);
    return "nm_" + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("") + Date.now().toString(36);
  }

  // ── State (kept while you move around the site, saved in this browser) ──
  const state = load();
  let view = null;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || "null");
      if (s && Array.isArray(s.messages)) {
        return {
          messages: s.messages.filter((m) => m && typeof m.text === "string").slice(-MAX_SAVED),
          mode: MODES.some((m) => m[0] === s.mode) ? s.mode : "both",
          sessionId: typeof s.sessionId === "string" ? s.sessionId : newId(),
          busy: false,
        };
      }
    } catch { /* storage unavailable or corrupt: start fresh */ }
    return { messages: [], mode: "both", sessionId: newId(), busy: false };
  }
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        messages: state.messages.filter((m) => !m.error).slice(-MAX_SAVED),
        mode: state.mode,
        sessionId: state.sessionId,
      }));
    } catch { /* ignore */ }
  }

  // ── Tiny, safe markdown (bold, italics, lists, headings, [n] citations) ──
  function inline(s) {
    s = esc(s);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/\[(\d{1,2})\]/g, '<sup class="nm-cite">$1</sup>');
    return s;
  }
  function mdToHtml(text) {
    let html = "";
    let list = null;
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of String(text).replace(/\r/g, "").split("\n")) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { close(); continue; }
      if ((m = line.match(/^#{1,4}\s+(.*)/))) { close(); html += `<h4>${inline(m[1])}</h4>`; }
      else if ((m = line.match(/^\s*[-*\u2022]\s+(.*)/))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)/))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[2])}</li>`; }
      else { close(); html += `<p>${inline(line)}</p>`; }
    }
    close();
    return html;
  }

  // ── Views ────────────────────────────────────────────────────
  const SEND_ICON = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 10h13M11 4.5 16.5 10 11 15.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function render(container) {
    container.innerHTML = "";
    const root = el(`
      <div class="nm">
        <div class="nm-head">
          <img class="nm-head__logo" src="assets/images/nutrimind-mark-96.png" srcset="assets/images/nutrimind-mark-192.png 2x" width="48" height="48" alt="" />
          <div class="nm-head__text">
            <h1 class="nm-head__title">Chakudya NutriMind</h1>
            <p class="nm-head__sub">Nutrition answers from the Chakudya Nutrition Registry</p>
          </div>
          <button type="button" class="btn btn--sm nm-new" id="nm-new">New chat</button>
        </div>
        <div class="nm-thread" id="nm-thread" aria-live="polite" aria-relevant="additions"></div>
        <div class="nm-composer">
          <div class="nm-modes" role="group" aria-label="Answer focus"></div>
          <div class="nm-box">
            <textarea id="nm-input" rows="1" maxlength="${MAX_Q}" placeholder="Ask about a food, nutrient or diet" aria-label="Your question"></textarea>
            <button type="button" class="nm-send" id="nm-send" aria-label="Send question">${SEND_ICON}</button>
          </div>
          <p class="nm-fine">NutriMind uses AI and may make mistakes. It gives general nutrition information and does not replace a qualified health professional. Please do not share personal or patient details. <a href="#/legal/disclaimer">Clinical disclaimer</a></p>
        </div>
      </div>
    `);
    container.appendChild(root);
    view = {
      root,
      thread: root.querySelector("#nm-thread"),
      input: root.querySelector("#nm-input"),
      send: root.querySelector("#nm-send"),
      modes: root.querySelector(".nm-modes"),
    };

    paintModes();
    paint();

    view.send.addEventListener("click", submit);
    view.input.addEventListener("keydown", (e) => {
      const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      if (e.key === "Enter" && !e.shiftKey && !touch) { e.preventDefault(); submit(); }
    });
    view.input.addEventListener("input", autosize);
    root.querySelector("#nm-new").addEventListener("click", () => {
      if (state.busy) return;
      state.messages = [];
      state.sessionId = newId();
      save();
      paint();
      view.input.focus();
    });
  }

  function autosize() {
    const t = view.input;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 140) + "px";
  }

  function paintModes() {
    view.modes.innerHTML = "";
    for (const [value, label] of MODES) {
      const b = el(`<button type="button" class="nm-mode" aria-pressed="${state.mode === value}">${label}</button>`);
      b.addEventListener("click", () => { state.mode = value; save(); paintModes(); });
      view.modes.appendChild(b);
    }
  }

  function paint() {
    if (!view || !view.root.isConnected) return;
    view.thread.innerHTML = "";
    if (!state.messages.length) view.thread.appendChild(welcome());
    state.messages.forEach((m, i) => view.thread.appendChild(messageEl(m, i)));
    if (state.busy) view.thread.appendChild(typingEl());
    view.send.disabled = state.busy;
    const last = view.thread.lastElementChild;
    if (last && state.messages.length) last.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  function welcome() {
    const w = el(`
      <div class="nm-welcome">
        <img class="nm-welcome__logo" src="assets/images/nutrimind-logo-420.webp" width="120" height="120" alt="Chakudya NutriMind logo" />
        <h2>Hi, I'm NutriMind</h2>
        <p>Ask about Malawian foods, nutrients and nutrition guidance. Answers come with their sources.</p>
        <div class="nm-prompts"></div>
      </div>
    `);
    const box = w.querySelector(".nm-prompts");
    for (const p of PROMPTS) {
      const b = el(`<button type="button" class="nm-prompt">${esc(p)}</button>`);
      b.addEventListener("click", () => ask(p));
      box.appendChild(b);
    }
    return w;
  }

  function messageEl(m, index) {
    if (m.role === "user") {
      const u = el('<div class="nm-msg nm-msg--user"><div class="nm-bubble"></div></div>');
      u.querySelector(".nm-bubble").textContent = m.text;
      return u;
    }
    const b = el(`
      <div class="nm-msg nm-msg--bot${m.error ? " nm-msg--error" : ""}">
        <img class="nm-avatar" src="assets/images/nutrimind-mark-96.png" width="28" height="28" alt="" />
        <div class="nm-bubble"></div>
      </div>
    `);
    const bubble = b.querySelector(".nm-bubble");
    if (m.error) {
      const p = document.createElement("p");
      p.textContent = m.text;
      bubble.appendChild(p);
      if (m.retry) {
        const r = el('<button type="button" class="btn btn--sm nm-retry">Try again</button>');
        r.addEventListener("click", () => {
          if (state.busy) return;
          // Drop the error and the question that caused it, then ask again.
          state.messages.splice(index - 1, 2);
          ask(m.retry);
        });
        bubble.appendChild(r);
      }
      return b;
    }
    bubble.innerHTML = mdToHtml(m.text);
    const tools = el('<div class="nm-tools"></div>');
    if (m.sources && m.sources.length) {
      const d = el(`<details class="nm-sources"><summary>Sources (${m.sources.length})</summary><ol></ol></details>`);
      const ol = d.querySelector("ol");
      for (const s of m.sources) {
        const li = document.createElement("li");
        li.textContent = s.title && s.source && s.title !== s.source ? `${s.title} \u00b7 ${s.source}` : (s.title || s.source || "Source");
        ol.appendChild(li);
      }
      tools.appendChild(d);
    }
    const copy = el('<button type="button" class="nm-copy">Copy</button>');
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(m.text); copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy"), 1500); }
      catch { copy.textContent = "Press and hold to copy"; }
    });
    tools.appendChild(copy);
    bubble.appendChild(tools);
    return b;
  }

  function typingEl() {
    return el(`
      <div class="nm-msg nm-msg--bot" role="status" aria-label="NutriMind is thinking">
        <img class="nm-avatar" src="assets/images/nutrimind-mark-96.png" width="28" height="28" alt="" />
        <div class="nm-bubble nm-typing"><span></span><span></span><span></span></div>
      </div>
    `);
  }

  // ── Asking ───────────────────────────────────────────────────
  function submit() {
    if (!view) return;
    const q = view.input.value;
    if (!q.trim()) return;
    view.input.value = "";
    autosize();
    ask(q);
  }

  function failText(status) {
    if (status === 429) return "NutriMind is very busy right now. Please wait a minute and try again.";
    if (status === 400) return "I couldn't read that question. Try rephrasing it.";
    return "NutriMind had a problem answering. Please try again.";
  }

  async function ask(question) {
    const q = String(question).trim().slice(0, MAX_Q);
    if (!q || state.busy) return;
    state.messages.push({ role: "user", text: q });
    state.busy = true;
    save();
    paint();

    const base = String((AppState.state && AppState.state.baseUrl) || "").replace(/\/$/, "");
    let reply = null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(base + "/rag/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, context: state.mode, session_id: state.sessionId }),
        signal: ctrl.signal,
      });
      const body = await res.json().catch(() => null);
      const data = body && (body.data || body);
      if (res.ok && data && typeof data.answer === "string" && data.answer.trim()) {
        reply = {
          role: "bot",
          text: data.answer,
          sources: (Array.isArray(data.sources) ? data.sources : []).slice(0, 8).map((s) => ({ title: s.title || "", source: s.source || "" })),
        };
      } else {
        reply = { role: "bot", error: true, text: failText(res.status), retry: q };
      }
    } catch (err) {
      reply = {
        role: "bot", error: true, retry: q,
        text: err && err.name === "AbortError"
          ? "That took too long. Please try again."
          : "Couldn't reach NutriMind. Check your connection and try again.",
      };
    } finally {
      clearTimeout(timer);
    }
    state.messages.push(reply);
    state.busy = false;
    save();
    paint();
  }

  return { render };
})();
