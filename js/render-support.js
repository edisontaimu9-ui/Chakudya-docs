/* Support page (route "#/support").
 * Contributions go through PayChangu Standard Checkout via the paychangu-payment-gateway Worker,
 * the same one the portfolio uses. The Worker holds the secret key; nothing secret ships to the browser.
 *   POST {WORKER}/api/support/initiate     -> { status: "success", checkout_url }
 *   GET  {WORKER}/api/support/verify/:ref  -> PayChangu verify payload (used when the donor returns here) */
const RenderSupport = (() => {
  const WORKER_URL = "https://paychangu-payment-gateway.edisontaimu9.workers.dev";
  const CONTACT_EMAIL = "edisontaimu9@gmail.com";
  // Whole amounts only: the Worker rounds to a whole number before sending to PayChangu.
  const CURRENCIES = {
    MWK: { label: "Kwacha (MWK)", min: 500, def: 5000, presets: [2000, 5000, 10000, 20000] },
    USD: { label: "US dollars (USD)", min: 1, def: 10, presets: [5, 10, 25, 50] },
  };
  const TIMEOUT_MS = 20000;

  const fmt = (n) => Number(n).toLocaleString("en-US");

  // Dot spinner (styles in css/landing.css). Decorative: the status message beside it is what screen readers hear.
  const spinner = (hidden) => `<span class="dot-spinner"${hidden ? " hidden" : ""} aria-hidden="true">${'<span class="dot-spinner__dot"></span>'.repeat(8)}</span>`;

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function chipsHtml(code) {
    const { presets, def } = CURRENCIES[code];
    return presets.map((v) =>
      `<button type="button" class="lp-chip" data-amount="${v}" aria-pressed="${v === def}">${code} ${fmt(v)}</button>`).join("");
  }

  function page() {
    const cur = CURRENCIES.MWK;
    const chips = chipsHtml("MWK");
    const curChips = Object.keys(CURRENCIES).map((c) =>
      `<button type="button" class="lp-chip" data-currency="${c}" aria-pressed="${c === "MWK"}">${CURRENCIES[c].label}</button>`).join("");
    return el(`
      <div class="lp submit-page support-page">
        <nav class="submit-crumb" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true"> / </span><span aria-current="page">Support</span></nav>

        <header class="submit-head">
          <p class="lp-kicker">Support</p>
          <h1 id="support-title" class="submit-title">Support Chakudya</h1>
          <p class="lp-sub">Chakudya is a free nutrition data registry for Malawi, built and run by Edison Taimu. If it is useful to you, a contribution helps keep the API online and the food data growing.</p>
        </header>

        <div id="support-banner" hidden></div>

        <section class="submit-flow" aria-labelledby="support-form-h">
          <h2 id="support-form-h" class="submit-flow__title">Make a contribution</h2>

          <p class="submit-step"><span class="submit-step__n" aria-hidden="true">1</span> Choose a currency and amount</p>
          <div class="lp-contrib__modes" role="group" aria-label="Currency">${curChips}</div>
          <div class="lp-contrib__modes" id="support-amounts" role="group" aria-label="Contribution amount">${chips}</div>

          <form class="lp-card lp-contrib__form" id="support-form" novalidate>
            <label class="field"><span class="field__label"><span id="support-amount-label">Amount (MWK)</span> <span class="param-required">required</span></span>
              <input type="text" name="amount" inputmode="numeric" autocomplete="off" value="${cur.def}" aria-describedby="support-amount-hint" />
              <span class="field__hint" id="support-amount-hint">Minimum MWK ${fmt(cur.min)}. Choose a button above or type your own amount.</span></label>

            <div class="field-grid">
              <label class="field"><span class="field__label">Name</span>
                <input type="text" name="name" maxlength="60" autocomplete="name" placeholder="Optional" /></label>
              <label class="field"><span class="field__label">Email</span>
                <input type="email" name="email" maxlength="120" autocomplete="email" placeholder="Optional, for your receipt" /></label>
            </div>

            <div class="lp-contrib__actions">
              <button class="btn btn--primary btn--lg btn-cut" type="submit" id="support-btn">Contribute MWK ${fmt(cur.def)}</button>
              ${spinner(true)}
              <p class="lp-contrib__msg" id="support-msg" role="status" aria-live="polite"></p>
            </div>
          </form>
        </section>

        <div class="submit-info">
          <section class="lp-card submit-card" aria-labelledby="support-how-h">
            <h2 id="support-how-h" class="submit-card__title">How it works</h2>
            <ol class="submit-list submit-list--num">
              <li><strong>Pick an amount</strong> and press the button.</li>
              <li><strong>Pay on PayChangu's secure page</strong> with mobile money, bank transfer or card.</li>
              <li><strong>Come back here</strong> and we confirm the payment for you.</li>
            </ol>
          </section>
          <section class="lp-card submit-card" aria-labelledby="support-good-h">
            <h2 id="support-good-h" class="submit-card__title">Good to know</h2>
            <ul class="submit-list">
              <li>Payments are handled by PayChangu. Your card or mobile money details never touch this site.</li>
              <li>A contribution is a voluntary gift. It does not change your API access or rate limits.</li>
              <li>Chakudya stays free to use whether or not you contribute.</li>
            </ul>
          </section>
        </div>
      </div>
    `);
  }

  function say(root, text, kind) {
    const m = root.querySelector("#support-msg");
    m.textContent = text || "";
    if (kind) m.setAttribute("data-kind", kind); else m.removeAttribute("data-kind");
  }

  function setBusy(root, on) {
    const sp = root.querySelector(".lp-contrib__actions .dot-spinner");
    if (sp) sp.hidden = !on;
    root.querySelector("#support-btn").disabled = on;
  }

  function banner(root, kind) {
    const b = root.querySelector("#support-banner");
    b.hidden = false;
    b.className = "account-msg account-msg--" + (kind === "success" ? "ok" : "err");
    b.setAttribute("role", "status");
    b.textContent = "";
    if (kind === "success") {
      b.textContent = "Payment received. Thank you for supporting Chakudya.";
    } else {
      b.append("We could not confirm that payment. If money left your account, please email ");
      const a = document.createElement("a");
      a.href = "mailto:" + CONTACT_EMAIL;
      a.textContent = CONTACT_EMAIL;
      b.append(a, " and include the time of the payment.");
    }
    b.scrollIntoView({ block: "nearest" });
  }

  /** When PayChangu sends the donor back with ?tx_ref=..., ask the Worker whether the payment went through. */
  async function verifyReturn(root) {
    const params = new URLSearchParams(location.search);
    const ref = params.get("tx_ref");
    if (!ref) return;
    // Remove the payment params right away so a refresh or a shared link never re-runs the check.
    history.replaceState(null, "", location.pathname);
    if (!/^[\w-]{6,100}$/.test(ref)) return banner(root, "failed");
    try {
      const res = await fetch(`${WORKER_URL}/api/support/verify/${encodeURIComponent(ref)}`);
      const data = await res.json();
      const ok = data && data.status === "success" && data.data && data.data.status === "success";
      banner(root, ok ? "success" : "failed");
    } catch (_) {
      banner(root, "failed");
    }
  }

  function hydrate(root) {
    const form = root.querySelector("#support-form");
    const input = form.elements.amount;
    const btn = root.querySelector("#support-btn");
    const amounts = root.querySelector("#support-amounts");
    const curChips = [...root.querySelectorAll(".lp-chip[data-currency]")];
    let code = "MWK";

    const parse = () => {
      const digits = input.value.replace(/[,\s]/g, "");
      return /^\d+$/.test(digits) ? Number(digits) : NaN;
    };
    const sync = () => {
      const n = parse();
      amounts.querySelectorAll(".lp-chip").forEach((c) => c.setAttribute("aria-pressed", String(Number(c.dataset.amount) === n)));
      curChips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.currency === code)));
      btn.textContent = Number.isFinite(n) && n > 0 ? `Contribute ${code} ${fmt(n)}` : "Contribute";
    };

    amounts.addEventListener("click", (e) => {
      const c = e.target.closest && e.target.closest(".lp-chip[data-amount]");
      if (!c) return;
      input.value = c.dataset.amount; say(root, ""); sync();
    });
    curChips.forEach((c) => c.addEventListener("click", () => {
      code = c.dataset.currency;
      const cfg = CURRENCIES[code];
      amounts.innerHTML = chipsHtml(code);
      input.value = cfg.def;
      root.querySelector("#support-amount-label").textContent = `Amount (${code})`;
      root.querySelector("#support-amount-hint").textContent = `Minimum ${code} ${fmt(cfg.min)}. Choose a button above or type your own amount.`;
      say(root, ""); sync();
    }));
    input.addEventListener("input", () => { say(root, ""); sync(); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = parse();
      const min = CURRENCIES[code].min;
      if (!Number.isFinite(amount) || amount < min) return say(root, `Please enter a whole amount of at least ${code} ${fmt(min)}.`, "error");
      const name = form.elements.name.value.trim();
      const email = form.elements.email.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say(root, "That email address does not look right.", "error");

      setBusy(root, true);
      say(root, "Opening the secure payment page\u2026", "info");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${WORKER_URL}/api/support/initiate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            amount,
            currency: code,
            first_name: name || undefined,
            email: email || undefined,
            title: "Support Chakudya",
            message: "Support the Chakudya Nutrition Registry",
            return_url: location.origin + "/support/",
          }),
        });
        const data = await res.json();
        if (data && data.status === "success" && typeof data.checkout_url === "string" && /^https:\/\//.test(data.checkout_url)) {
          window.location.href = data.checkout_url;
          return; // keep the button disabled while the browser navigates away
        }
        say(root, (data && data.message) || "Could not start the payment. Please try again.", "error");
      } catch (err) {
        say(root, err && err.name === "AbortError"
          ? "The payment service took too long to respond. Please try again."
          : "Could not reach the payment service. Check your connection and try again.", "error");
      } finally {
        clearTimeout(timer);
      }
      setBusy(root, false);
    });

    sync();
    verifyReturn(root);
  }

  function render(container) {
    container.innerHTML = "";
    const root = page();
    container.appendChild(root);
    hydrate(root);
  }

  return { render };
})();
