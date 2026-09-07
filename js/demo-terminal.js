/**
 * Animated terminal-style demo for the overview hero — types out a real
 * Chakudya response (shape taken straight from handleFoodsLookup/success()),
 * pauses, then loops to the next example. Purely decorative: doesn't call
 * the live API, so it never depends on the base URL or network access.
 */
const DemoTerminal = (() => {
  const EXAMPLES = [
    {
      method: "GET",
      route: "/foods/lookup?q=nsima",
      data: {
        status: "success",
        source: "local",
        cached: true,
        freshly_cached: false,
        data: {
          id: 214,
          food_name: "Nsima (thick, maize)",
          category: "Staples",
          measure: "1 chunk / mpanda (200g)",
          weight_g: 200,
          kcal: 123,
          protein_g: 2.6,
          carbs_g: 27.1,
          fat_g: 0.5,
          iron_mg: 0.9,
          calcium_mg: 5,
        },
      },
    },
    {
      method: "GET",
      route: "/foods/compare?foods=nsima,rice,potatoes",
      data: {
        status: "success",
        data: {
          nutrient_comparison: {
            energy_kcal: { label: "Energy (kcal)", highest: "Rice", lowest: "Potatoes" },
            fiber_g: { label: "Fiber (g)", highest: "Potatoes", lowest: "Rice" },
          },
        },
      },
    },
    {
      method: "POST",
      route: "/meals/analyze",
      data: {
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
    },
  ];

  const TYPE_MS = 12;
  const HOLD_MS = 2200;
  const ERASE_MS = 5;

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

  function mount(hero) {
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

    if (reduceMotion) {
      const ex = EXAMPLES[0];
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
        const ex = EXAMPLES[index % EXAMPLES.length];
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
