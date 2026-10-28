/**
 * Chakudya NutriMind - nutrition assistant page ("#/nutrimind").
 * Calls the public POST /rag/ask route (no API key in the browser) and shows the
 * grounded answer with its sources. Chats and what NutriMind remembers stay in this browser only.
 * Features: saved chats + memory of your interests, dynamic welcome and sample prompts,
 * branching a chat, retrying an answer and editing a question.
 */
const RenderNutriMind = (() => {
  const STORE = "cnr.nutrimind.v2";
  const OLD_STORE = "cnr.nutrimind.v1";
  const SID_STORE = "cnr.nutrimind.sid"; // anonymous id for server memory (nm_ + random), kept apart so "forget" can replace it
  const REASONS = [["inaccurate", "Inaccurate"], ["incomplete", "Missing info"], ["unclear", "Unclear"], ["other", "Other"]];
  const MAX_Q = 600;
  const MAX_SAVED = 40;
  const MAX_CHATS = 25;
  const MAX_RECENT = 12;
  const TOPK_STEPS = [6, 8, 5, 7]; // a retry searches a little differently so it can word the answer differently

  // What NutriMind can notice you are interested in (kept on this device only).
  const TOPICS = {
    energy:       ["energy", "\u26A1", /energy|calori|kcal|portion/i],
    protein:      ["protein", "\u{1F4AA}", /protein/i],
    iron:         ["iron", "\u{1FA78}", /iron|anaemi|anemi/i],
    vitamins:     ["vitamins", "\u{1F34A}", /vitamin|folate|folic/i],
    calcium:      ["calcium", "\u{1F9B4}", /calcium|bone/i],
    fibre:        ["fibre", "\u{1F33E}", /fibre|fiber/i],
    staples:      ["staples", "\u{1F33D}", /nsima|maize|cassava|sorghum|millet|rice|potato|porridge|staple/i],
    infant:       ["infant feeding", "\u{1F476}", /infant|baby|babies|breastfe|complementary|weaning|6[- ]month/i],
    child:        ["child nutrition", "\u{1F9D2}", /child|toddler|kids?\b/i],
    pregnancy:    ["pregnancy", "\u{1F930}", /pregnan|lactat/i],
    weight:       ["healthy weight", "\u2696\uFE0F", /weight|obes|bmi/i],
    meal:         ["meal ideas", "\u{1F37D}\uFE0F", /breakfast|lunch|dinner|meal|menu|recipe/i],
    sodium:       ["salt and sodium", "\u{1F9C2}", /sodium|salt/i],
    kidney:       ["kidney diets", "\u{1FA7A}", /kidney|renal|potassium|phosph/i],
    diabetes:     ["diabetes diets", "\u{1FA7A}", /diabet|glyc|glucose|insulin|carbohydrate|carb\b/i],
    enteral:      ["tube feeding", "\u{1F37C}", /enteral|tube|formula|parenteral/i],
    drugs:        ["drug\u2013nutrient interactions", "\u{1F48A}", /warfarin|drug|medic|interaction/i],
    malnutrition: ["malnutrition", "\u26A0\uFE0F", /malnutrition|wasting|stunting|muac|refeeding|screen/i],
    requirements: ["patient requirements", "\u{1FA7A}", /requirement|burn|icu|estimate/i],
  };

  // Sample prompts: [icon, question, group, topic, best time of day (optional)]
  const POOL = [
    ["\u{1F33D}", "How many calories are in nsima?", "general", "energy"],
    ["\u{1F33D}", "How much nsima is a good portion for an adult?", "general", "energy"],
    ["\u{1F34C}", "How many calories are in a banana?", "general", "energy"],
    ["\u{1FA78}", "Which Malawian foods are rich in iron?", "general", "iron"],
    ["\u{1F96C}", "Which leafy vegetables give the most iron?", "general", "iron"],
    ["\u{1F4AA}", "Compare groundnuts and soya pieces for protein", "general", "protein"],
    ["\u{1F41F}", "How much protein is in chambo?", "general", "protein"],
    ["\u{1F95A}", "How much protein is in an egg?", "general", "protein"],
    ["\u{1FAD8}", "Which beans and pulses are best for protein?", "general", "protein"],
    ["\u{1F34A}", "Which local fruits are high in vitamin C?", "general", "vitamins"],
    ["\u{1F955}", "Which foods are good sources of vitamin A?", "general", "vitamins"],
    ["\u{1F9B4}", "Which foods give calcium besides milk?", "general", "calcium"],
    ["\u{1F33E}", "Which Malawian foods are high in fibre?", "general", "fibre"],
    ["\u{1F360}", "How does sweet potato compare with white potato?", "general", "staples"],
    ["\u{1F476}", "What are good first foods for a 6-month-old?", "general", "infant"],
    ["\u{1F930}", "What should I eat more of during pregnancy?", "general", "pregnancy"],
    ["\u{1F9D2}", "How can I make porridge more nutritious for children?", "general", "child"],
    ["\u2696\uFE0F", "How can I eat well and keep a healthy weight?", "general", "weight"],
    ["\u{1F9C2}", "Which foods are high in sodium?", "general", "sodium"],
    ["\u{1F373}", "What is a healthy Malawian breakfast?", "general", "meal", "morning"],
    ["\u{1F372}", "What is a balanced lunch using local foods?", "general", "meal", "midday"],
    ["\u{1F319}", "What is a light, healthy dinner idea?", "general", "meal", "evening"],
    ["\u{1FA7A}", "What foods should I limit on a kidney-friendly diet?", "clinical", "kidney"],
    ["\u{1FA7A}", "Which foods are high in potassium?", "clinical", "kidney"],
    ["\u{1FA7A}", "What is the glycaemic index of nsima?", "clinical", "diabetes"],
    ["\u{1F35E}", "How do I count carbohydrates in a meal?", "clinical", "diabetes"],
    ["\u{1F37C}", "Which enteral formulas are available?", "clinical", "enteral"],
    ["\u{1F48A}", "Which foods interact with warfarin?", "clinical", "drugs"],
    ["\u26A0\uFE0F", "How do I screen an adult for malnutrition?", "clinical", "malnutrition"],
    ["\u26A0\uFE0F", "What are the signs of refeeding syndrome?", "clinical", "malnutrition"],
    ["\u{1FA7A}", "How do I estimate a patient's energy needs?", "clinical", "requirements"],
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
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const validMode = (m) => (MODES.some((x) => x[0] === m) ? m : "both");
  const newChat = (extra) => ({ id: uid(), title: "", messages: [], mode: "both", updated: Date.now(), ...extra });

  function cleanChat(c) {
    return {
      id: String(c.id),
      title: typeof c.title === "string" ? c.title.slice(0, 80) : "",
      messages: c.messages.filter((m) => m && typeof m.text === "string" && (m.role === "user" || m.role === "bot")).slice(-MAX_SAVED),
      mode: validMode(c.mode),
      updated: Number(c.updated) || Date.now(),
      branchOf: typeof c.branchOf === "string" ? c.branchOf.slice(0, 80) : "",
    };
  }
  function cleanMemory(m) {
    const out = { topics: {}, recent: [], last: null, shown: [], visits: 0, seen: 0 };
    if (!m || typeof m !== "object") return out;
    if (m.topics && typeof m.topics === "object") {
      for (const k of Object.keys(TOPICS)) if (Number(m.topics[k]) > 0) out.topics[k] = Math.min(999, Number(m.topics[k]));
    }
    if (Array.isArray(m.recent)) out.recent = m.recent.filter((x) => typeof x === "string").slice(0, MAX_RECENT);
    if (Array.isArray(m.shown)) out.shown = m.shown.filter((x) => typeof x === "string").slice(0, 8);
    if (m.last && typeof m.last.q === "string") out.last = { q: m.last.q.slice(0, 160), topics: Array.isArray(m.last.topics) ? m.last.topics.filter((k) => TOPICS[k]) : [], at: Number(m.last.at) || 0 };
    out.visits = Number(m.visits) || 0;
    out.seen = Number(m.seen) || 0;
    return out;
  }

  const state = load();
  let view = null;
  let hero = null; // cached welcome text + sample prompts, rebuilt when the chat, mode or memory changes

  function load() {
    let chats = [];
    let activeId = null;
    let memory = null;
    let server = true;
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || "null");
      if (s && Array.isArray(s.chats)) {
        server = s.server !== false;
        chats = s.chats.filter((c) => c && typeof c.id === "string" && Array.isArray(c.messages)).map(cleanChat);
        activeId = s.activeId;
        memory = s.memory;
      } else {
        // Carry over the single chat saved by the earlier version.
        const o = JSON.parse(localStorage.getItem(OLD_STORE) || "null");
        if (o && Array.isArray(o.messages) && o.messages.length) chats = [cleanChat({ id: uid(), messages: o.messages, mode: o.mode, updated: Date.now() })];
      }
    } catch { /* storage unavailable or corrupt: start fresh */ }
    memory = cleanMemory(memory);
    const now = Date.now();
    if (now - memory.seen > 30 * 60 * 1000) memory.visits += 1; // a new visit, not a page refresh
    memory.seen = now;
    let active = chats.find((c) => c.id === activeId) || chats.slice().sort((a, b) => b.updated - a.updated)[0];
    if (!active) { active = newChat(); chats.unshift(active); }
    return { chats, activeId: active.id, memory, server, messages: active.messages.slice(), mode: active.mode, busy: false, stream: null };
  }
  const activeChat = () => state.chats.find((c) => c.id === state.activeId);

  function save() {
    const c = activeChat();
    if (c) {
      c.messages = state.messages.filter((m) => !m.error).slice(-MAX_SAVED);
      c.mode = state.mode;
      if (c.messages.length) c.updated = Date.now();
      if (!c.title) { const f = c.messages.find((m) => m.role === "user"); if (f) c.title = f.text.slice(0, 60); }
    }
    // Keep the newest chats only; empty chats other than the open one are not worth saving.
    state.chats = state.chats.filter((x) => x.id === state.activeId || x.messages.length);
    if (state.chats.length > MAX_CHATS) {
      const keep = state.chats.slice().sort((a, b) => (b.id === state.activeId) - (a.id === state.activeId) || b.updated - a.updated).slice(0, MAX_CHATS);
      state.chats = state.chats.filter((x) => keep.includes(x));
    }
    for (let tries = 0; tries < 5; tries++) {
      try {
        localStorage.setItem(STORE, JSON.stringify({ v: 2, activeId: state.activeId, chats: state.chats, memory: state.memory, server: state.server }));
        return;
      } catch {
        // Storage full: drop the oldest saved chat and try again.
        const old = state.chats.filter((x) => x.id !== state.activeId).sort((a, b) => a.updated - b.updated)[0];
        if (!old) return;
        state.chats = state.chats.filter((x) => x !== old);
      }
    }
  }

  // ── Memory: topics you keep asking about, so the welcome and ideas fit you ──
  function topicsOf(text) {
    return Object.keys(TOPICS).filter((k) => TOPICS[k][2].test(text));
  }
  function remember(q) {
    const m = state.memory;
    const found = topicsOf(q);
    for (const k of found) m.topics[k] = (m.topics[k] || 0) + 1;
    m.recent = [q, ...m.recent.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
    m.last = { q: q.slice(0, 160), topics: found, at: Date.now() };
  }
  function interests(n) {
    return Object.entries(state.memory.topics).sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]);
  }
  function forgetMemory() {
    newSessionId(); // the old server notes can no longer be reached from this browser
    state.memory = cleanMemory(null);
    state.memory.seen = Date.now();
    hero = null;
    save();
  }

  // ── Server memory: short notes about what you asked, kept under an anonymous id for this browser ──
  function sessionId() {
    try {
      let id = localStorage.getItem(SID_STORE) || "";
      if (!/^nm_[a-z0-9]{12,40}$/.test(id)) {
        id = "nm_" + (Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join(""));
        localStorage.setItem(SID_STORE, id);
      }
      return id;
    } catch { return ""; }
  }
  function newSessionId() { try { localStorage.removeItem(SID_STORE); } catch { /* ignore */ } }
  const apiBase = () => String((AppState.state && AppState.state.baseUrl) || "").replace(/\/$/, "");
  async function post(path, payload, ms) {
    const site = ApiClient.siteRequest(apiBase() + path);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 15000);
    try {
      return await fetch(site.url, { method: "POST", headers: { "Content-Type": "application/json", ...site.headers }, body: JSON.stringify(payload), signal: ctrl.signal });
    } finally { clearTimeout(t); }
  }
  function writeServerMemory(q) {
    const sid = state.server ? sessionId() : "";
    if (!sid) return;
    post("/memory/write", { session_id: sid, content: `User asked: ${q}`.slice(0, 300) }).catch(() => {});
  }
  async function sendFeedback(m, rating, reason) {
    const i = state.messages.indexOf(m);
    const q = i > 0 && state.messages[i - 1].role === "user" ? state.messages[i - 1].text : "";
    if (!q) return;
    try {
      const res = await post("/feedback", { fid: m.fid, rating, reason: reason || "", mode: state.mode, question: q, answer: m.text });
      flash(res.ok ? (rating === "none" ? "Feedback removed" : "Thanks for the feedback") : "Couldn't send feedback. Saved on this device.");
    } catch { flash("Couldn't send feedback. Saved on this device."); }
  }

  // ── Dynamic welcome and sample prompts ──
  const slotNow = () => { const h = new Date().getHours(); return h < 10 ? "morning" : h < 15 ? "midday" : h < 21 ? "evening" : "night"; };

  function pickPrompts(n) {
    const slot = slotNow();
    const top = interests(3);
    const asked = new Set(state.memory.recent.map((x) => x.toLowerCase()));
    const shown = new Set(state.memory.shown);
    const scored = POOL
      .filter((p) => (state.mode === "both" || p[2] === state.mode) && (!p[4] || p[4] === slot))
      .map((p) => {
        let score = Math.random() * 2;
        if (top[0] === p[3]) score += 2.5; else if (top.includes(p[3])) score += 1.5;
        if (p[4] === slot) score += 1.5;
        if (shown.has(p[1])) score -= 1.5;
        if (asked.has(p[1].toLowerCase())) score -= 4;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score);
    const picks = [];
    const usedTopics = new Set();
    for (const { p } of scored) {
      if (picks.length >= n) break;
      if (usedTopics.has(p[3])) continue;
      usedTopics.add(p[3]);
      picks.push(p);
    }
    // In "All" mode, show a mix of everyday and clinical ideas.
    if (state.mode === "both" && picks.length === n && new Set(picks.map((p) => p[2])).size === 1) {
      const other = scored.find(({ p }) => p[2] !== picks[0][2] && !usedTopics.has(p[3]));
      if (other) picks[n - 1] = other.p;
    }
    return picks.map((p) => [p[0], p[1]]);
  }

  function buildHero() {
    const h = new Date().getHours();
    const greet = h < 5 ? "Hello" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    const returning = state.memory.recent.length > 0;
    const top = interests(2).map((k) => TOPICS[k][0]);
    const slot = slotNow();
    let sub;
    if (state.mode === "clinical") sub = "Ask about clinical nutrition: renal and diabetic diets, tube feeding, screening and more. Answers come with their sources.";
    else if (returning && top.length) sub = `Last time you were exploring ${top.join(" and ")}. Pick up where you left off, or ask something new.`;
    else if (slot === "morning") sub = "Planning breakfast or the day's meals? Ask about Malawian foods, nutrients and nutrition guidance. Answers come with their sources.";
    else if (slot === "midday") sub = "Thinking about lunch? Ask about Malawian foods, nutrients and nutrition guidance. Answers come with their sources.";
    else if (slot === "evening") sub = "Planning dinner? Ask about Malawian foods, nutrients and nutrition guidance. Answers come with their sources.";
    else sub = "Ask about Malawian foods, nutrients and nutrition guidance. Answers come with their sources.";
    const prompts = pickPrompts(4);
    state.memory.shown = prompts.map((p) => p[1]);
    return { title: returning ? `${greet}! Welcome back` : `${greet}, I'm NutriMind`, sub, prompts };
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

  const SCAN_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 6.5V4.8A1.8 1.8 0 0 1 4.8 3h1.7M13.5 3h1.7A1.8 1.8 0 0 1 17 4.8v1.7M17 13.5v1.7a1.8 1.8 0 0 1-1.8 1.8h-1.7M6.5 17H4.8A1.8 1.8 0 0 1 3 15.2v-1.7M6.5 7v6M9 7v6M11 7v6M13.5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const HIST_ICON = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.2" stroke="currentColor" stroke-width="1.6"/><path d="M10 5.8V10l2.8 1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const BRANCH_ICON = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="4" cy="3.5" r="1.6" stroke="currentColor" stroke-width="1.4"/><circle cx="4" cy="12.5" r="1.6" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="6" r="1.6" stroke="currentColor" stroke-width="1.4"/><path d="M4 5.1v5.8M12 7.6c0 2.2-2.4 2.4-5 2.8-1.2.2-3 .4-3 .9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const RETRY_ICON = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.2 8A5.2 5.2 0 1 1 11.6 4.3M13.4 2.2v2.6h-2.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const EDIT_ICON = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 13.5l.6-3L10.8 3a1.4 1.4 0 0 1 2 2L5.5 12.4l-3 1.1zM9.6 4.2l2.2 2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
          <button type="button" class="btn btn--sm nm-iconbtn" id="nm-hist" aria-label="Chat history and memory" title="Chat history and memory">${HIST_ICON}</button>
          <button type="button" class="btn btn--sm nm-new" id="nm-new">New chat</button>
        </div>
        <div class="nm-thread" id="nm-thread" aria-live="polite" aria-relevant="additions"></div>
        <div class="nm-composer">
          <div class="nm-modes" role="group" aria-label="Answer focus"></div>
          <div class="nm-box">
            <textarea id="nm-input" rows="1" maxlength="${MAX_Q}" placeholder="Ask about a food, nutrient or diet" aria-label="Your question"></textarea>
            <button type="button" class="nm-scan" id="nm-scan" aria-label="Scan a barcode" title="Scan a barcode">${SCAN_ICON}</button>
            <input type="file" id="nm-scanfile" accept="image/*" capture="environment" hidden>
            <button type="button" class="nm-send" id="nm-send" aria-label="Send question">${SEND_ICON}</button>
          </div>
          <p class="nm-scanmsg" id="nm-scanmsg" role="status" hidden></p>
          <p class="nm-fine">NutriMind uses AI and may make mistakes. It gives general nutrition information and does not replace a qualified health professional. Please do not share personal or patient details. <a href="#/legal/disclaimer">Clinical disclaimer</a></p>
        </div>
        <div class="nm-drawer" id="nm-drawer" hidden>
          <div class="nm-drawer__scrim" data-close></div>
          <aside class="nm-drawer__panel" role="dialog" aria-modal="true" aria-label="Chat history and memory">
            <div class="nm-drawer__head"><h3>Your chats</h3><button type="button" class="nm-x" data-close aria-label="Close">\u2715</button></div>
            <button type="button" class="btn btn--sm btn--primary nm-drawer__new" id="nm-d-new">+ New chat</button>
            <ul class="nm-chatlist" id="nm-chatlist"></ul>
            <section class="nm-mem" aria-label="What NutriMind remembers">
              <h4>What NutriMind remembers</h4>
              <p class="nm-mem__text" id="nm-mem-text"></p>
              <label class="nm-switch"><input type="checkbox" id="nm-server" /><span>Server memory: let NutriMind use my past questions to tailor answers</span></label>
              <button type="button" class="btn btn--sm" id="nm-forget">Forget my interests</button>
              <p class="nm-mem__hint">Chats stay in this browser. With server memory on, a short note of each question is stored under a random id (no name or account) and used to personalise answers. Forgetting starts a fresh id.</p>
            </section>
          </aside>
        </div>
      </div>
    `);
    container.appendChild(root);
    view = {
      editing: null,
      drawer: root.querySelector("#nm-drawer"),
      root,
      thread: root.querySelector("#nm-thread"),
      input: root.querySelector("#nm-input"),
      send: root.querySelector("#nm-send"),
      scan: root.querySelector("#nm-scan"),
      scanFile: root.querySelector("#nm-scanfile"),
      scanMsg: root.querySelector("#nm-scanmsg"),
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
    view.scan.addEventListener("click", () => { scanNote(""); view.scanFile.click(); });
    view.scanFile.addEventListener("change", () => {
      const f = view.scanFile.files && view.scanFile.files[0];
      view.scanFile.value = "";
      if (f) scanBarcode(f);
    });
    root.querySelector("#nm-new").addEventListener("click", () => startNewChat());
    root.querySelector("#nm-hist").addEventListener("click", openDrawer);
    root.querySelector("#nm-d-new").addEventListener("click", () => { if (startNewChat()) closeDrawer(); });
    root.querySelector("#nm-forget").addEventListener("click", () => {
      if (!confirm("Forget the topics NutriMind has noticed you ask about? Your saved chats stay.")) return;
      forgetMemory();
      paintDrawer();
      if (!state.messages.length) paint();
    });
    root.querySelector("#nm-server").addEventListener("change", (e) => { state.server = e.target.checked; save(); flash(state.server ? "Server memory on" : "Server memory off"); });
    view.drawer.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeDrawer(); });
    root.addEventListener("keydown", (e) => { if (e.key === "Escape" && !view.drawer.hidden) closeDrawer(); });
  }

  // ── Chats: new, switch, delete, branch ──
  function flash(text) {
    if (!view) return;
    const t = el('<div class="nm-toast" role="status"></div>');
    t.textContent = text;
    view.root.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }
  function busyNow() {
    if (state.stream) finishStream();
    if (!state.busy) return false;
    flash("Please wait for the answer to finish.");
    return true;
  }
  function activate(c) {
    state.activeId = c.id;
    state.messages = c.messages.slice();
    state.mode = c.mode;
    view.editing = null;
    hero = null;
    save();
    paintModes();
    paint();
    window.scrollTo(0, 0);
  }
  function startNewChat() {
    if (busyNow()) return false;
    view.editing = null;
    if (state.messages.length) {
      const c = newChat({ mode: state.mode });
      state.chats.unshift(c);
      activate(c);
    } else { hero = null; save(); paint(); }
    view.input.focus();
    return true;
  }
  function switchChat(id) {
    if (id === state.activeId) { closeDrawer(); return; }
    if (busyNow()) return;
    const c = state.chats.find((x) => x.id === id);
    if (!c) return;
    save();
    activate(c);
    closeDrawer();
  }
  function deleteChat(id) {
    if (busyNow()) return;
    const c = state.chats.find((x) => x.id === id);
    if (!c || !confirm("Delete this chat?")) return;
    state.chats = state.chats.filter((x) => x.id !== id);
    if (id === state.activeId) {
      const next = state.chats.slice().sort((a, b) => b.updated - a.updated)[0] || newChat();
      if (!state.chats.includes(next)) state.chats.unshift(next);
      activate(next);
    } else save();
    paintDrawer();
  }
  // New branch: copy the chat up to this message into a new chat, so you can explore another path.
  function branchFrom(index) {
    if (busyNow()) return null;
    const src = activeChat();
    const label = (src && src.title) || "Chat";
    const copy = state.messages.slice(0, index + 1).filter((m) => !m.error).map((m) => ({ ...m, sources: m.sources ? m.sources.map((x) => ({ ...x })) : m.sources }));
    const c = newChat({ title: label, messages: copy, mode: state.mode, branchOf: label });
    save();
    state.chats.unshift(c);
    activate(c);
    return c;
  }
  function openDrawer() {
    paintDrawer();
    view.drawer.hidden = false;
    const a = view.drawer.querySelector(".nm-chatlist button, #nm-d-new");
    if (a) a.focus();
  }
  function closeDrawer() { view.drawer.hidden = true; }
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    if (m < 1440) return Math.round(m / 60) + " h ago";
    return Math.round(m / 1440) + " d ago";
  };
  function paintDrawer() {
    const list = view.drawer.querySelector("#nm-chatlist");
    list.innerHTML = "";
    const chats = state.chats.filter((c) => c.id === state.activeId ? state.messages.length : c.messages.length).sort((a, b) => b.updated - a.updated);
    if (!chats.length) list.appendChild(el('<li class="nm-chatlist__empty">No saved chats yet.</li>'));
    for (const c of chats) {
      const li = el(`<li class="nm-chat${c.id === state.activeId ? " is-active" : ""}"><button type="button" class="nm-chat__open"><span class="nm-chat__title"></span><span class="nm-chat__meta"></span></button><button type="button" class="nm-chat__del" aria-label="Delete chat">\u2715</button></li>`);
      li.querySelector(".nm-chat__title").textContent = (c.branchOf ? "\u2442 " : "") + (c.title || "New chat");
      li.querySelector(".nm-chat__meta").textContent = ago(c.updated);
      li.querySelector(".nm-chat__open").addEventListener("click", () => switchChat(c.id));
      li.querySelector(".nm-chat__del").addEventListener("click", () => deleteChat(c.id));
      list.appendChild(li);
    }
    const top = interests(5);
    view.drawer.querySelector("#nm-mem-text").textContent = top.length
      ? "You have been exploring: " + top.map((k) => TOPICS[k][1] + " " + TOPICS[k][0]).join(", ") + "."
      : "Nothing yet. As you ask questions, NutriMind notices the topics you care about and tailors the welcome and ideas.";
    view.drawer.querySelector("#nm-server").checked = state.server;
    view.drawer.querySelector("#nm-forget").disabled = !top.length && !state.memory.recent.length;
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
      b.addEventListener("click", () => {
        state.mode = value; hero = null; save(); paintModes();
        if (!state.messages.length) paint();
      });
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
    const chat = activeChat();
    if (!state.messages.length) view.thread.appendChild(welcome());
    else if (chat && chat.branchOf) {
      const n = el('<div class="nm-branchnote">' + BRANCH_ICON + '<span></span></div>');
      n.querySelector("span").textContent = "Branched from \u201C" + chat.branchOf + "\u201D. The original chat is unchanged.";
      view.thread.appendChild(n);
    }
    state.messages.forEach((m, i) => view.thread.appendChild(messageEl(m, i)));
    if (state.busy && !state.stream) view.thread.appendChild(typingEl());
    updateSend();
    const editor = view.thread.querySelector(".nm-edit textarea");
    if (editor) {
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(editor.value.length, editor.value.length);
      editor.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const last = view.thread.lastElementChild;
    if (last && state.messages.length) {
      if (animate && !reducedMotion()) last.classList.add("nm-msg--new");
      last.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }

  function welcome() {
    if (!hero) hero = buildHero();
    const w = el(`
      <div class="nm-welcome">
        <img class="nm-welcome__logo" src="assets/images/nutrimind-logo-420.webp" width="120" height="120" alt="Chakudya NutriMind logo" />
        <h2></h2>
        <p></p>
        <div class="nm-prompts"></div>
        <button type="button" class="nm-shuffle">\u21BB New ideas</button>
      </div>
    `);
    w.querySelector("h2").textContent = hero.title;
    w.querySelector("p").textContent = hero.sub;
    const box = w.querySelector(".nm-prompts");
    for (const [icon, p] of hero.prompts) {
      const b = el(`<button type="button" class="nm-prompt"><span class="nm-prompt__icon" aria-hidden="true">${icon}</span><span>${esc(p)}</span></button>`);
      b.addEventListener("click", () => ask(p));
      box.appendChild(b);
    }
    w.querySelector(".nm-shuffle").addEventListener("click", () => { hero = null; paint(); });
    return w;
  }

  function userActions(index) {
    const row = el('<div class="nm-acts"></div>');
    const ed = el(`<button type="button" class="nm-act">${EDIT_ICON}<span>Edit</span></button>`);
    ed.addEventListener("click", () => { if (busyNow()) return; view.editing = index; paint(); });
    row.appendChild(ed);
    return row;
  }

  function editorEl(m, index) {
    const e = el(`
      <div class="nm-msg nm-msg--user nm-msg--edit">
        <div class="nm-edit">
          <textarea rows="2" maxlength="${MAX_Q}" aria-label="Edit your question"></textarea>
          <div class="nm-edit__row">
            <button type="button" class="btn btn--sm" data-a="cancel">Cancel</button>
            <button type="button" class="btn btn--sm" data-a="branch">Send as new branch</button>
            <button type="button" class="btn btn--sm btn--primary" data-a="save">Save &amp; send</button>
          </div>
        </div>
      </div>
    `);
    const ta = e.querySelector("textarea");
    ta.value = m.text;
    const fit = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 180) + "px"; };
    ta.addEventListener("input", fit);
    requestAnimationFrame(fit);
    const go = (asBranch) => applyEdit(index, ta.value, asBranch);
    e.querySelector('[data-a="cancel"]').addEventListener("click", () => { view.editing = null; paint(); });
    e.querySelector('[data-a="save"]').addEventListener("click", () => go(false));
    e.querySelector('[data-a="branch"]').addEventListener("click", () => go(true));
    ta.addEventListener("keydown", (ev) => {
      const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      if (ev.key === "Enter" && !ev.shiftKey && !touch) { ev.preventDefault(); go(false); }
      if (ev.key === "Escape") { view.editing = null; paint(); }
    });
    return e;
  }

  function applyEdit(index, text, asBranch) {
    const q = String(text).trim().slice(0, MAX_Q);
    if (!q) return;
    if (busyNow()) return;
    view.editing = null;
    if (asBranch) {
      if (!branchFrom(index - 1)) return; // everything before the edited question
    } else {
      state.messages.splice(index); // the edited question and everything after it
    }
    ask(q);
  }

  // Retry: ask the same question again (only for the latest answer, so nothing after it is lost).
  function retryLast(index) {
    if (busyNow()) return;
    const u = state.messages[index - 1];
    if (!u || u.role !== "user") return;
    const attempt = (state.messages[index].tries || 0) + 1;
    state.messages.splice(index - 1);
    ask(u.text, { attempt });
  }

  const THUMB_UP = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 7.2V13H2.8V7.2H5zm0 0 2.3-4.6c1 0 1.7.8 1.5 1.8L8.4 6h3.6c.9 0 1.5.8 1.3 1.6l-.9 4.2a1.4 1.4 0 0 1-1.4 1.2H5" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  const THUMB_DOWN = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="transform:rotate(180deg)"><path d="M5 7.2V13H2.8V7.2H5zm0 0 2.3-4.6c1 0 1.7.8 1.5 1.8L8.4 6h3.6c.9 0 1.5.8 1.3 1.6l-.9 4.2a1.4 1.4 0 0 1-1.4 1.2H5" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>';

  // Like / dislike. The choice is kept with the message; a dislike offers one tap to say why.
  function feedbackEl(m) {
    const box = el('<span class="nm-fb" role="group" aria-label="Rate this answer"></span>');
    const up = el(`<button type="button" class="nm-act nm-fb__btn" aria-label="Good answer" title="Good answer">${THUMB_UP}</button>`);
    const down = el(`<button type="button" class="nm-act nm-fb__btn" aria-label="Bad answer" title="Bad answer">${THUMB_DOWN}</button>`);
    const why = el('<span class="nm-fb__why"></span>');
    const sync = () => {
      up.setAttribute("aria-pressed", m.fb === "up");
      down.setAttribute("aria-pressed", m.fb === "down");
      why.innerHTML = "";
      if (m.fb !== "down") return;
      const lead = document.createElement("span");
      lead.textContent = "What went wrong?";
      why.appendChild(lead);
      for (const [key, label] of REASONS) {
        const c = el(`<button type="button" class="nm-chip" aria-pressed="${m.fbReason === key}">${esc(label)}</button>`);
        c.addEventListener("click", () => { m.fbReason = key; save(); sync(); sendFeedback(m, "down", key); });
        why.appendChild(c);
      }
    };
    const rate = (value) => {
      m.fb = m.fb === value ? undefined : value;
      m.fbReason = undefined;
      save(); sync();
      sendFeedback(m, m.fb || "none", "");
    };
    up.addEventListener("click", () => rate("up"));
    down.addEventListener("click", () => rate("down"));
    box.append(up, down, why);
    sync();
    return box;
  }

  function messageEl(m, index) {
    if (m.role === "user") {
      if (view.editing === index) return editorEl(m, index);
      const u = el('<div class="nm-msg nm-msg--user"><div class="nm-ucol"><div class="nm-bubble"></div></div></div>');
      u.querySelector(".nm-bubble").textContent = m.text;
      if (!state.busy) u.querySelector(".nm-ucol").appendChild(userActions(index));
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
    if (m.fid) tools.appendChild(feedbackEl(m));
    if (!state.busy) {
      if (index === state.messages.length - 1 && index > 0) {
        const re = el(`<button type="button" class="nm-act">${RETRY_ICON}<span>Retry</span></button>`);
        re.addEventListener("click", () => retryLast(index));
        tools.appendChild(re);
      }
      const br = el(`<button type="button" class="nm-act">${BRANCH_ICON}<span>Branch</span></button>`);
      br.title = "Continue from here in a new chat";
      br.addEventListener("click", () => branchFrom(index));
      tools.appendChild(br);
    }
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
  const FOLLOW_UP = /^(and\b|what about\b|how about\b|what of\b|ok(ay)?\b|compare\b|versus\b|vs\.?\s|also\b|same for\b|now\b|then\b|instead\b|with\b|without\b|which (one )?is\b)|^\d+(\.\d+)?\s*(g|kg|ml|l|cups?|spoons?|tbsp|tsp|pieces?|servings?|portions?)\b|\b\d+(\.\d+)?\s*(g|kg|ml|cups?|spoons?|tbsp|tsp)\b/i;
  const PRONOUN = /\b(it|its|that|this|they|them|their|those|these|there|same|more)\b/i;
  function contextualQuery(q) {
    const words = q.split(/\s+/).length;
    if (words > 9 || !(FOLLOW_UP.test(q) || (words <= 7 && PRONOUN.test(q)))) return q;
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.role === "user") return `${m.apiText || m.text} ${q}`.slice(0, MAX_Q * 2);
    }
    return q;
  }

  // The last few turns, sent so the server can work out what a follow-up such as "Compare with
  // nsima" refers to. It is used only to understand the question; answers still come from sources.
  function chatHistory() {
    return state.messages
      .filter((m) => m && !m.error && typeof m.text === "string" && m.text.trim())
      .slice(-4)
      .map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        text: (m.role === "user" ? m.text : m.text.replace(/\[\d+\]/g, "")).replace(/\s+/g, " ").trim().slice(0, 300),
      }));
  }

  // Never show a dosing answer to someone who did not ask about insulin or diabetes.
  const DOSING = /units? of (?:rapid|short|long)?[- ]?(?:acting )?insulin|insulin dos(?:e|ing)|units of insulin/i;
  const DIABETES_ASKED = /insulin|diabet|glucose|glycaem|glycem|carbohydrate counting|carb counting/i;

  /* Barcode scanning: the photo is read in the browser (ZXing, via LabelScan). Only the digits are sent,
   * as an ordinary NutriMind question, so the photo never leaves the device. */
  function barcodeQuestion(code) {
    return `What are the nutrition facts for the packaged product with barcode ${code}?`;
  }
  function scanNote(msg) {
    if (!view || !view.scanMsg) return;
    view.scanMsg.textContent = msg;
    view.scanMsg.hidden = !msg;
  }
  async function scanBarcode(file) {
    if (typeof LabelScan === "undefined") { scanNote("Barcode scanning is not available right now. Type the barcode number instead."); return; }
    if (state.busy) { scanNote("Wait for the current answer, then scan again."); return; }
    scanNote("Reading barcode\u2026");
    view.scan.disabled = true;
    try {
      const { barcode } = await LabelScan.prepare(file);
      if (barcode) { scanNote(""); ask(barcodeQuestion(barcode)); }
      else scanNote("Could not read a barcode in that photo. Hold the camera steady, fill the frame with the bars, or type the number under the barcode.");
    } catch (e) {
      scanNote(e && e.message ? e.message : "Could not read that photo. Type the barcode number instead.");
    } finally {
      view.scan.disabled = false;
    }
  }

  async function ask(question, opts = {}) {
    let q = String(question).trim().slice(0, MAX_Q);
    // A bare barcode number (8, 12, 13 or 14 digits with a valid check digit) is treated as a barcode lookup.
    if (/^\d{8,14}$/.test(q) && typeof LabelScan !== "undefined" && LabelScan.gs1Ok(q)) q = barcodeQuestion(q);
    if (!q) return;
    if (state.stream) finishStream();
    if (state.busy) return;
    const apiQuery = contextualQuery(q);
    const history = chatHistory(); // before this question is added
    state.messages.push({ role: "user", text: q, apiText: apiQuery });
    state.busy = true;
    if (!opts.attempt) remember(q); // a retry is the same question, so it adds nothing new to memory
    save();
    paint(true);

    const base = String((AppState.state && AppState.state.baseUrl) || "").replace(/\/$/, "");
    let reply = null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const site = ApiClient.siteRequest(base + "/rag/ask");
      const sid = state.server ? sessionId() : "";
      const call = (withSession) => fetch(site.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...site.headers },
        body: JSON.stringify({
          query: apiQuery, context: state.mode,
          ...(history.length ? { history } : {}),
          ...(opts.attempt ? { top_k: TOPK_STEPS[opts.attempt % TOPK_STEPS.length] } : {}),
          ...(withSession ? { session_id: sid } : {}),
        }),
        signal: ctrl.signal,
      });
      let res = await call(!!sid);
      if (!res.ok && sid && res.status !== 429) res = await call(false); // memory unavailable: answer without it
      const body = await res.json().catch(() => null);
      const data = body && (body.data || body);
      if (res.ok && data && typeof data.answer === "string" && data.answer.trim()) {
        if (DOSING.test(data.answer) && !DIABETES_ASKED.test(apiQuery)) {
          reply = { role: "bot", text: "I wasn't sure what you meant, so I haven't answered. Try again with the food name, for example \u201CHow many calories are in 50 g of nsima?\u201D", sources: [] };
        } else {
          const shaped = shapeAnswer(data);
          reply = { role: "bot", text: shaped.text, sources: shaped.sources, tries: opts.attempt || 0, fid: uid() };
          if (!opts.attempt) writeServerMemory(q);
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
