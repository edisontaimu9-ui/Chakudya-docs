/**
 * Animated terminal-style demo for the overview hero — types out real,
 * live Chakudya API responses (fetched from the same base URL the rest
 * of the docs use), pauses, then loops to the next example.
 *
 * Each request is made once per page load and cached in memory; if a
 * request fails (offline, CORS, upstream error) that example silently
 * falls back to a last-known-good static snapshot so the demo never
 * shows an error state to a visitor.
 */
const DemoTerminal = (() => {
  const REQUESTS = [
    {
      method: "GET",
      route: "/foods/lookup?q=nsima",
      path: "/foods/lookup",
      query: { q: "nsima" },
    },
    {
      method: "GET",
      route: "/foods/compare?foods=nsima,rice,potatoes",
      path: "/foods/compare",
      query: { foods: "nsima,rice,potatoes" },
    },
    {
      method: "POST",
      route: "/meals/analyze",
      path: "/meals/analyze",
      body: {
        meal_type: "lunch",
        ingredients: [
          { food_name: "nsima", quantity: 1, unit: "chunk" },
          { food_name: "beans", quantity: 1, unit: "cup" },
          { food_name: "tomato", quantity: 1, unit: "medium" },
        ],
      },
    },
  ];

  // Last-known-good snapshots, used only if the live request fails.
  const FALLBACKS = [
    {
      status: "success",
      source: "local",
      cached: true,
      freshly_cached: false,
      data: {
        id: 214,
        food_name: "Nsima (thick, maize)",
        category: "Staples",
        measure: "1 chunk / chipande/mtanda (200g)",
        weight_g: 200,
        kcal: 123,
        protein_g: 2.6,
        carbs_g: 27.1,
        fat_g: 0.5,
        iron_mg: 0.9,
        calcium_mg: 5,
      },
    },
    {
      status: "success",
      data: {
        nutrient_comparison: {
          energy_kcal: { label: "Energy (kcal)", highest: "Rice", lowest: "Potatoes" },
          fiber_g: { label: "Fiber (g)", highest: "Potatoes", lowest: "Rice" },
        },
      },
    },
    {
      status: "success",
      data: {
        macronutrient_breakdown: {
          percent_kcal_from_protein: 14,
          percent_kcal_from_carbs: 61,
          percent_kcal_from_fat: 25,
        },
        food_groups_present: ["Grains", "Legumes", "Vegetables"],
        food_groups_missing: ["Dairy", "Fruits"],
      },
    },
  ];

  const TYPE_MS = 12;
  const HOLD_MS = 2200;
  const ERASE_MS = 5;

  let examplesPromise = null;

  /** Fetches all demo responses once, falling back per-example on failure. */
  function loadExamples() {
    if (examplesPromise) return examplesPromise;

    const baseUrl = AppState.state.baseUrl;

    examplesPromise = Promise.all(
      REQUESTS.map(async (req, i) => {
        if (!baseUrl) return { method: req.method, route: req.route, data: FALLBACKS[i] };
        try {
          const url = ApiClient.buildUrl(baseUrl, req.path, {}, req.query);
          const hasBody = !!req.body;
          const headers = ApiClient.buildHeaders({ hasBody });
          const result = await ApiClient.execute({
            url,
            method: req.method,
            headers,
            body: hasBody ? JSON.stringify(req.body) : undefined,
          });
          const data = result.ok && result.bodyJson ? result.bodyJson : FALLBACKS[i];
          return { method: req.method, route: req.route, data };
        } catch (_) {
          return { method: req.method, route: req.route, data: FALLBACKS[i] };
        }
      })
    );

    return examplesPromise;
  }

  function highlight(json) {
    const escaped = json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g,
      (match) => {
        let cls = "tok-num";
        if (/^"/.test(match)) cls = /:$/.test(match) ? "tok-key" : "tok-str";
        else if (/true|false/.test(match)) cls = "tok-bool";
        else if (/null/.test(match)) cls = "tok-null";
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }

  async function mount(hero) {
    const wrap = document.createElement("div");
    wrap.className = "demo-terminal";
    wrap.innerHTML = `
      <div class="demo-terminal__bar">
        <div class="demo-terminal__dots"><span></span><span></span><span></span></div>
        <div class="demo-terminal__route"><span class="demo-terminal__method"></span><span class="demo-terminal__path"></span></div>
      </div>
      <pre class="demo-terminal__body"><code></code><span class="demo-terminal__cursor"></span></pre>
    `;
    hero.appendChild(wrap);

    const methodEl = wrap.querySelector(".demo-terminal__method");
    const pathEl = wrap.querySelector(".demo-terminal__path");
    const codeEl = wrap.querySelector("code");

    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const examples = await loadExamples();
    if (!document.body.contains(wrap)) return; // navigated away while fetching

    if (reduceMotion) {
      const ex = examples[0];
      methodEl.textContent = ex.method;
      pathEl.textContent = ex.route;
      codeEl.innerHTML = highlight(JSON.stringify(ex.data, null, 2));
      return;
    }

    let stopped = false;
    wrap.addEventListener("mouseenter", () => { stopped = true; });
    wrap.addEventListener("mouseleave", () => { stopped = false; });

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function waitIfPaused() {
      while (stopped) await sleep(120);
    }

    async function typeText(full) {
      for (let i = 1; i <= full.length; i++) {
        await waitIfPaused();
        codeEl.innerHTML = highlight(full.slice(0, i));
        wrap.querySelector(".demo-terminal__body").scrollTop = wrap.querySelector(".demo-terminal__body").scrollHeight;
        await sleep(TYPE_MS);
      }
    }

    async function eraseText() {
      const current = codeEl.textContent;
      for (let i = current.length; i >= 0; i -= 3) {
        await waitIfPaused();
        codeEl.innerHTML = highlight(current.slice(0, i));
        await sleep(ERASE_MS);
      }
      codeEl.innerHTML = "";
    }

    async function loop() {
      let index = 0;
      while (document.body.contains(wrap)) {
        const ex = examples[index % examples.length];
        methodEl.textContent = ex.method;
        pathEl.textContent = ex.route;
        await typeText(JSON.stringify(ex.data, null, 2));
        await sleep(HOLD_MS);
        await eraseText();
        index++;
      }
    }

    loop();
  }

  return { mount };
})();
