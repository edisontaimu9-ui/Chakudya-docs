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
    ["\u{1F33D}", "How many calories are in nsima?"],
    ["\u{1FA78}", "Which Malawian foods are rich in iron?"],
    ["\u{1FA7A}", "What foods should I limit on a kidney-friendly diet?"],
    ["\u{1F4AA}", "Compare groundnuts and soya pieces for protein"],
  ];
  const MODES = [
    ["both", "\u2728 All"],
    ["general", "\u{1F372} Everyday"],
    ["clinical", "\u{1FA7A} Clinical"],
  ];
  const TICK_MS = 28;
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
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
          busy: false,
          stream: null,
        };
      }
    } catch { /* storage unavailable or corrupt: start fresh */ }
    return { messages: [], mode: "both", busy: false, stream: null };
  }
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        messages: state.messages.filter((m) => !m.error).slice(-MAX_SAVED),
        mode: state.mode,
      }));
    } catch { /* ignore */ }
  }

  // ── Emoji, callouts and nutrient cards (presentation only, never changes the facts) ──
  const EMOJI_RULES = [
    [/energy|calori|kcal|kilojoule/i, "\u26A1"],
    [/protein/i, "\u{1F4AA}"],
    [/\bfats?\b|\boils?\b/i, "\u{1FAD2}"],
    [/fibre|fiber/i, "\u{1F33E}"],
    [/sugar/i, "\u{1F36C}"],
    [/calcium|bone/i, "\u{1F9B4}"],
    [/vitamin a\b/i, "\u{1F441}\uFE0F"],
    [/vitamin c\b/i, "\u{1F34A}"],
    [/vitamin d\b/i, "\u2600\uFE0F"],
    [/iron|anaemi|anemi/i, "\u{1FA78}"],
    [/zinc/i, "\u{1F6E1}\uFE0F"],
    [/potassium/i, "\u{1F34C}"],
    [/sodium|salt/i, "\u{1F9C2}"],
    [/carb|starch/i, "\u{1F35E}"],
    [/water|fluid|hydrat/i, "\u{1F4A7}"],
    [/vitamin|mineral|micronutrient|folate|folic/i, "\u{1F9EA}"],
    [/maize|nsima|cassava|sorghum|millet|rice|bread|staple|cereal|grain|porridge/i, "\u{1F33D}"],
    [/bean|legume|groundnut|peanut|soya|soy\b|pulse|lentil|cowpea|pigeon pea/i, "\u{1FAD8}"],
    [/fish|chambo|usipa|kapenta/i, "\u{1F41F}"],
    [/meat|beef|chicken|goat|pork|poultry/i, "\u{1F357}"],
    [/\begg/i, "\u{1F95A}"],
    [/milk|dairy|yoghurt|yogurt|cheese/i, "\u{1F95B}"],
    [/sweet potato|potato/i, "\u{1F360}"],
    [/vegetable|leafy|greens|spinach|kale|pumpkin leaves|tomato/i, "\u{1F96C}"],
    [/fruit|mango|banana|orange|papaya|guava/i, "\u{1F34E}"],
    [/infant|baby|babies|breastfe|complementary|weaning/i, "\u{1F476}"],
    [/child|toddler/i, "\u{1F9D2}"],
    [/pregnan|lactat/i, "\u{1F930}"],
    [/kidney|renal|diabet|glyc|glucose|insulin|clinical/i, "\u{1FA7A}"],
    [/malnutrition|wasting|stunting|underweight/i, "\u26A0\uFE0F"],
    [/tube|enteral|formula/i, "\u{1F37C}"],
    [/weight|obes|bmi/i, "\u2696\uFE0F"],
    [/exercise|activity/i, "\u{1F3C3}"],
    [/meal|menu|recipe|diet|serving|portion/i, "\u{1F37D}\uFE0F"],
    [/avoid|limit|reduce|restrict/i, "\u26A0\uFE0F"],
  ];
  const STARTS_WITH_EMOJI = /^\p{Extended_Pictographic}/u;
  function emojiFor(text) {
    const t = String(text || "").trim();
    if (!t || STARTS_WITH_EMOJI.test(t)) return "";
    for (const [re, emoji] of EMOJI_RULES) if (re.test(t)) return emoji;
    return "";
  }
  const withEmoji = (text, html) => {
    const e = emojiFor(text);
    return e ? `<span class="nm-emoji" aria-hidden="true">${e}</span>${html}` : html;
  };

  const CALLOUTS = {
    tip: ["\u{1F4A1}", "tip"], note: ["\u{1F4DD}", "note"], remember: ["\u{1F4CC}", "note"],
    important: ["\u26A0\uFE0F", "warn"], warning: ["\u26A0\uFE0F", "warn"], caution: ["\u26A0\uFE0F", "warn"],
  };
  const CALLOUT_RE = /^(tip|note|remember|important|warning|caution)\s*[:\u2013-]\s*(.+)/i;

  const NUTRIENT_NAME = /^(energy|calories?|protein|carbohydrates?|carbs|total fat|fat|saturated fat|fibre|fiber|dietary fibre|dietary fiber|sugars?|iron|zinc|calcium|magnesium|potassium|sodium|phosphorus|selenium|iodine|folate|vitamin [a-ek]|vitamin b\d{1,2}|thiamine|riboflavin|niacin|cholesterol|water)$/i;
  const NUTRIENT_LINE = /^\s*([A-Za-z][A-Za-z ]{1,24}?)\s*[:\u2013-]\s*(?:about |approximately |approx\.? |around |~)?(\d+(?:[.,]\d+)?)\s*(kcal|kj|g|mg|\u00b5g|mcg|ug|iu|%)(?![A-Za-z])\s*(.*)$/i;
  function parseNutrients(items) {
    if (items.length < 3) return null;
    const out = [];
    for (const raw of items) {
      const m = raw.replace(/\*/g, "").match(NUTRIENT_LINE);
      if (!m || !NUTRIENT_NAME.test(m[1].trim())) return null;
      out.push({ name: m[1].trim(), value: m[2], unit: m[3], note: m[4].replace(/^[\s,;()-]+|[\s,;()-]+$/g, "") });
    }
    return out;
  }
  function factsHtml(list) {
    return '<div class="nm-facts" role="list">' + list.map((n) => {
      const icon = emojiFor(n.name) || "\u{1F9EA}";
      return `<div class="nm-fact" role="listitem"><span class="nm-fact__icon" aria-hidden="true">${icon}</span>` +
        `<span class="nm-fact__val">${esc(n.value)}<small>${esc(n.unit)}</small></span>` +
        `<span class="nm-fact__name">${esc(n.name)}</span>` +
        (n.note ? `<span class="nm-fact__note">${esc(n.note)}</span>` : "") + "</div>";
    }).join("") + "</div>";
  }

  // ── Tiny, safe markdown (bold, italics, lists, headings) ──
  function inline(s) {
    s = esc(s);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
    return s;
  }
  function mdToHtml(text) {
    // 1) split into blocks
    const blocks = [];
    let cur = null;
    for (const raw of String(text).replace(/\r/g, "").split("\n")) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { cur = null; continue; }
      if ((m = line.match(/^#{1,4}\s+(.*)/))) { blocks.push({ t: "h", text: m[1] }); cur = null; }
      else if ((m = line.match(/^\s*[-*\u2022]\s+(.*)/))) { if (!cur || cur.t !== "ul") { cur = { t: "ul", items: [] }; blocks.push(cur); } cur.items.push(m[1]); }
      else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)/))) { if (!cur || cur.t !== "ol") { cur = { t: "ol", items: [] }; blocks.push(cur); } cur.items.push(m[2]); }
      else { blocks.push({ t: "p", text: line }); cur = null; }
    }
    // 2) render
    let html = "";
    for (const b of blocks) {
      if (b.t === "h") {
        html += `<h4>${withEmoji(b.text.replace(/\*/g, ""), inline(b.text))}</h4>`;
      } else if (b.t === "p") {
        const c = b.text.match(CALLOUT_RE);
        if (c) {
          const [icon, kind] = CALLOUTS[c[1].toLowerCase()];
          html += `<div class="nm-callout nm-callout--${kind}"><span class="nm-callout__icon" aria-hidden="true">${icon}</span><div>${inline(c[2])}</div></div>`;
        } else html += `<p>${inline(b.text)}</p>`;
      } else {
        const facts = b.t === "ul" ? parseNutrients(b.items) : null;
        if (facts) { html += factsHtml(facts); continue; }
        html += `<${b.t}>` + b.items.map((it) => {
          const lead = it.match(/^\*\*(.+?)\*\*/);
          return `<li>${lead ? withEmoji(lead[1], inline(it)) : inline(it)}</li>`;
        }).join("") + `</${b.t}>`;
      }
    }
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

    view.send.addEventListener("click", () => { if (state.stream) finishStream(); else submit(); });
    view.input.addEventListener("keydown", (e) => {
      const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      if (e.key === "Enter" && !e.shiftKey && !touch) { e.preventDefault(); submit(); }
    });
    view.input.addEventListener("input", autosize);
    root.querySelector("#nm-new").addEventListener("click", () => {
      if (state.stream) finishStream();
      if (state.busy) return;
      state.messages = [];
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
      const b = el(`<button type="button" class="nm-mode" aria-pressed="${state.mode === value}">${esc(label)}</button>`);
      b.addEventListener("click", () => { state.mode = value; save(); paintModes(); });
      view.modes.appendChild(b);
    }
  }

  const STOP_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor"/></svg>';

  function updateSend() {
    if (!view) return;
    const streaming = !!state.stream;
    view.send.disabled = state.busy && !streaming;
    view.send.innerHTML = streaming ? STOP_ICON : SEND_ICON;
    view.send.setAttribute("aria-label", streaming ? "Show the full answer now" : "Send question");
    view.send.classList.toggle("is-stop", streaming);
  }

  function paint(animate) {
    if (!view || !view.root.isConnected) return;
    view.live = null;
    view.thread.innerHTML = "";
    if (!state.messages.length) view.thread.appendChild(welcome());
    state.messages.forEach((m, i) => view.thread.appendChild(messageEl(m, i)));
    if (state.busy && !state.stream) view.thread.appendChild(typingEl());
    updateSend();
    const last = view.thread.lastElementChild;
    if (last && state.messages.length) {
      if (animate && !reducedMotion()) last.classList.add("nm-msg--new");
      last.scrollIntoView({ block: "end", behavior: "smooth" });
    }
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
    for (const [icon, p] of PROMPTS) {
      const b = el(`<button type="button" class="nm-prompt"><span class="nm-prompt__icon" aria-hidden="true">${icon}</span><span>${esc(p)}</span></button>`);
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
    if (state.stream && state.stream.msg === m) {
      bubble.innerHTML = partialHtml(state.stream);
      view.live = bubble;
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
    if (!view || state.stream) return;
    const q = view.input.value;
    if (!q.trim()) return;
    view.input.value = "";
    autosize();
    ask(q);
  }

  function failText(status) {
    if (status === 401) return "NutriMind can't reach the registry right now. Please try again later.";
    if (status === 429) return "NutriMind is very busy right now. Please wait a minute and try again.";
    if (status === 400) return "I couldn't read that question. Try rephrasing it.";
    return "NutriMind had a problem answering. Please try again.";
  }

  // Citation markers in any bracket style the model uses: [1], [1, 2], 【1】, 【1†source】
  const CITE_RE = /[\[\u3010\uFF3B]\s*(\d{1,2}(?:\s*[,\u3001\uFF0C]\s*\d{1,2})*)(?:\s*\u2020[^\]\u3011\uFF3D]*)?\s*[\]\u3011\uFF3D]/g;

  // Show sources only when the answer actually leans on them: greetings and small talk
  // get none, and each source appears once however many times it was cited.
  function shapeAnswer(data) {
    const raw = String(data.answer);
    const all = Array.isArray(data.sources) ? data.sources : [];
    const cited = new Set();
    for (const m of raw.matchAll(CITE_RE)) m[1].split(/[,\u3001\uFF0C]/).forEach((n) => cited.add(parseInt(n, 10)));
    const text = raw
      .replace(new RegExp("\\s*" + CITE_RE.source, "g"), "")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/([,;])\s*([.,;:!?])/g, "$2")
      .trim();
    const seen = new Set();
    const sources = [];
    if (data.intent !== "general_chat") {
      for (const n of [...cited].sort((a, b) => a - b)) {
        const s = all[n - 1];
        if (!s) continue;
        const title = s.title || s.source || "";
        const origin = s.source && s.source !== "knowledge_base" && s.source !== title ? s.source : "";
        const key = (title + "|" + origin).toLowerCase();
        if (!title || seen.has(key)) continue;
        seen.add(key);
        sources.push({ title, source: origin });
      }
    }
    return { text: text || raw, sources: sources.slice(0, 6) };
  }

  // ── Word-by-word reveal (the API returns the whole answer; we show it progressively) ──
  function partialHtml(st) {
    let text = st.parts.slice(0, st.pos).join("");
    if ((text.match(/\*\*/g) || []).length % 2) text += "**"; // keep half-typed bold tidy
    return mdToHtml(text) + '<span class="nm-caret" aria-hidden="true"></span>';
  }

  function nearBottom() {
    return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 180;
  }

  function startStream(msg) {
    const parts = msg.text.split(/(\s+)/);
    const perTick = Math.max(2, Math.ceil(parts.length / 240));
    state.stream = { msg, parts, pos: 0, perTick, timer: null };
    paint(true);
    state.stream.timer = setInterval(() => {
      const st = state.stream;
      if (!st) return;
      st.pos = Math.min(st.parts.length, st.pos + st.perTick);
      if (st.pos >= st.parts.length) { finishStream(); return; }
      if (view && view.live && view.live.isConnected) {
        const follow = nearBottom();
        view.live.innerHTML = partialHtml(st);
        if (follow) window.scrollTo(0, document.documentElement.scrollHeight);
      }
    }, TICK_MS);
  }

  function finishStream() {
    const st = state.stream;
    if (!st) return;
    clearInterval(st.timer);
    state.stream = null;
    state.busy = false;
    save();
    paint();
  }

  // A short follow-up such as "What about 50g?" means nothing on its own, and the search
  // can latch onto unrelated documents. Send it together with the question it follows.
  const FOLLOW_UP = /^(and\b|what about\b|how about\b|what of\b|ok(ay)?\b)|^\d+(\.\d+)?\s*(g|kg|ml|l|cups?|spoons?|tbsp|tsp|pieces?|servings?|portions?)\b|\b\d+(\.\d+)?\s*(g|kg|ml|cups?|spoons?|tbsp|tsp)\b/i;
  function contextualQuery(q) {
    if (q.split(/\s+/).length > 9 || !FOLLOW_UP.test(q)) return q;
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.role === "user") return `${m.apiText || m.text} ${q}`.slice(0, MAX_Q * 2);
    }
    return q;
  }

  // Never show a dosing answer to someone who did not ask about insulin or diabetes.
  const DOSING = /units? of (?:rapid|short|long)?[- ]?(?:acting )?insulin|insulin dos(?:e|ing)|units of insulin/i;
  const DIABETES_ASKED = /insulin|diabet|glucose|glycaem|glycem|carbohydrate counting|carb counting/i;

  async function ask(question) {
    const q = String(question).trim().slice(0, MAX_Q);
    if (!q) return;
    if (state.stream) finishStream();
    if (state.busy) return;
    const apiQuery = contextualQuery(q);
    state.messages.push({ role: "user", text: q, apiText: apiQuery });
    state.busy = true;
    save();
    paint(true);

    const base = String((AppState.state && AppState.state.baseUrl) || "").replace(/\/$/, "");
    let reply = null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(base + "/rag/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ApiClient.siteAuthHeaders(base + "/rag/ask") },
        body: JSON.stringify({ query: apiQuery, context: state.mode }),
        signal: ctrl.signal,
      });
      const body = await res.json().catch(() => null);
      const data = body && (body.data || body);
      if (res.ok && data && typeof data.answer === "string" && data.answer.trim()) {
        if (DOSING.test(data.answer) && !DIABETES_ASKED.test(apiQuery)) {
          reply = { role: "bot", text: "I wasn't sure what you meant, so I haven't answered. Try again with the food name, for example \u201CHow many calories are in 50 g of nsima?\u201D", sources: [] };
        } else {
          const shaped = shapeAnswer(data);
          reply = { role: "bot", text: shaped.text, sources: shaped.sources };
        }
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
    if (!reply.error && !reducedMotion()) { startStream(reply); return; }
    state.busy = false;
    save();
    paint(true);
  }

  return { render };
})();
