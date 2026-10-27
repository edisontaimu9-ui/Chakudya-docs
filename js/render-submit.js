/* Dedicated "Submit a food" page (route "#/submit").
 * Two ways in: photograph the label (POST /packaged/scan) or type the details in (POST /packaged/submit).
 * The form logic moved here from the landing page, which now only links to this page. */
const RenderSubmit = (() => {
  const NUTRIENTS = [
    ["energy_kcal", "Energy (kcal)", true],
    ["protein_g", "Protein (g)"],
    ["fat_g", "Fat (g)"],
    ["saturated_fat_g", "Saturated fat (g)"],
    ["carbs_g", "Carbohydrate (g)"],
    ["sugar_g", "Sugars (g)"],
    ["fiber_g", "Fibre (g)"],
    ["sodium_mg", "Sodium (mg)"],
  ];
  const MAX_PHOTOS = 5;

  // Dot spinner (styles in css/landing.css). Decorative: the status message beside it is what screen readers hear.
  const spinner = (hidden) => `<span class="dot-spinner"${hidden ? " hidden" : ""} aria-hidden="true">${'<span class="dot-spinner__dot"></span>'.repeat(8)}</span>`;
  const setBusy = (form, on) => { const sp = form.querySelector(".lp-contrib__actions .dot-spinner"); if (sp) sp.hidden = !on; };

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function page() {
    return el(`
      <div class="lp submit-page">
        <nav class="submit-crumb" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true"> / </span><span aria-current="page">Submit a food</span></nav>

        <header class="submit-head">
          <p class="lp-kicker">Community</p>
          <h1 id="submit-title" class="submit-title">Submit a packaged food</h1>
          <p class="lp-sub">Add a packaged product that is missing from the Chakudya Nutrition Registry. Every submission is reviewed before it is published, then shared with everyone through the API.</p>
        </header>

        <div class="submit-info">
          <section class="lp-card submit-card" aria-labelledby="submit-how-h">
            <h2 id="submit-how-h" class="submit-card__title">How it works</h2>
            <ol class="submit-list submit-list--num">
              <li><strong>Choose a method.</strong> Photograph the pack, or type the label values in yourself.</li>
              <li><strong>Fill in the required fields.</strong> They are marked <span class="param-required">required</span> below.</li>
              <li><strong>Press Submit.</strong> A reviewer checks the entry, including a calories versus macros check, before it goes live.</li>
            </ol>
          </section>
          <section class="lp-card submit-card" aria-labelledby="submit-req-h">
            <h2 id="submit-req-h" class="submit-card__title">Required fields</h2>
            <p class="submit-card__sub">Photograph the label</p>
            <ul class="submit-list"><li>At least 1 photo (up to ${MAX_PHOTOS})</li><li>Barcode, 8 to 14 digits</li></ul>
            <p class="submit-card__sub">Type it in</p>
            <ul class="submit-list"><li>Product name</li><li>Barcode, 8 to 14 digits</li><li>Energy (kcal)</li><li>Serving size, only when the label values are per serving</li></ul>
          </section>
        </div>

        <section class="submit-flow" aria-labelledby="submit-form-h">
          <h2 id="submit-form-h" class="submit-flow__title">Your submission</h2>

          <div id="submit-done" class="lp-card submit-done" role="status" aria-live="polite" hidden>
            <h3>Thank you, your food was submitted</h3>
            <p id="submit-done-text"></p>
            <div class="lp-contrib__actions">
              <button type="button" class="btn btn--primary btn-cut" id="submit-again">Submit another food</button>
              <a class="btn" href="#/">Back to home</a>
            </div>
          </div>

          <div id="submit-body">
            <p class="submit-step"><span class="submit-step__n" aria-hidden="true">1</span> Choose how to submit</p>
            <div class="lp-contrib__modes" role="group" aria-label="How to submit">
              <button type="button" class="lp-chip" data-mode="photo" aria-pressed="true">Photograph the label</button>
              <button type="button" class="lp-chip" data-mode="manual" aria-pressed="false">Type it in</button>
            </div>

            <p class="submit-step"><span class="submit-step__n" aria-hidden="true">2</span> Fill in the details</p>

            <form class="lp-card lp-contrib__form" id="lp-photo-form" novalidate>
              <p class="lp-contrib__hint">Add up to <strong>${MAX_PHOTOS} photos</strong>. The barcode and the nutrition label are often on different sides of the pack, so photograph each one. Keep the text flat, sharp and well lit.</p>
              <div class="lp-contrib__pick">
                <button type="button" class="btn" id="lp-photo-cam">Take a photo</button>
                <button type="button" class="btn" id="lp-photo-up">Upload photos</button>
                <span class="lp-contrib__count" id="lp-photo-count" aria-live="polite">0 of ${MAX_PHOTOS} photos</span>
                <input type="file" id="lp-photo-cam-in" accept="image/*" capture="environment" hidden />
                <input type="file" id="lp-photo-up-in" accept="image/*" multiple hidden />
              </div>
              <ul class="lp-contrib__thumbs" id="lp-photo-thumbs" aria-label="Selected photos"></ul>
              <label class="field"><span class="field__label">Barcode <span class="param-required">required</span></span>
                <input type="text" name="barcode" id="lp-photo-barcode" inputmode="numeric" maxlength="20" placeholder="Read from your photos, or type it" autocomplete="off" />
                <span class="field__hint" id="lp-photo-barcode-note">We try to read the barcode from your photos. If that fails, type the digits under the bars.</span></label>
              <div class="lp-contrib__trap" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off" /></label></div>
              <div class="lp-contrib__actions">
                <button class="btn btn--primary btn--lg btn-cut" type="submit" id="lp-photo-btn">Submit photos for review</button>
                ${spinner(true)}
                <p class="lp-contrib__msg" id="lp-photo-msg" role="status" aria-live="polite"></p>
              </div>
            </form>

            <form class="lp-card lp-contrib__form" hidden id="lp-submit-form" novalidate>
              <div class="field-grid">
                <label class="field"><span class="field__label">Product name <span class="param-required">required</span></span>
                  <input type="text" name="product_name" maxlength="120" autocomplete="off" required /></label>
                <label class="field"><span class="field__label">Barcode <span class="param-required">required</span></span>
                  <input type="text" name="barcode" inputmode="numeric" maxlength="20" placeholder="8 to 14 digits" autocomplete="off" required /></label>
                <label class="field"><span class="field__label">Brand</span>
                  <input type="text" name="brand" maxlength="80" autocomplete="off" /></label>
                <label class="field"><span class="field__label">Label values are per</span>
                  <select name="per"><option value="100g">100 g</option><option value="100ml">100 ml</option><option value="serving">One serving</option></select></label>
                <label class="field" id="lp-serving-wrap" hidden><span class="field__label">Serving size <span class="param-required">required</span></span>
                  <input type="text" name="serving_size" maxlength="30" placeholder="e.g. 30g" autocomplete="off" /></label>
              </div>
              <div class="field-grid">
                ${NUTRIENTS.map(([k, l, req]) => `
                <label class="field"><span class="field__label">${l}${req ? ' <span class="param-required">required</span>' : ""}</span>
                  <input type="text" name="${k}" inputmode="decimal" autocomplete="off" /></label>`).join("")}
              </div>
              <label class="field"><span class="field__label">Ingredients</span>
                <textarea name="ingredients_text" maxlength="1000" rows="3"></textarea>
                <span class="field__hint">Optional. Copy them as printed on the pack.</span></label>
              <div class="lp-contrib__trap" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off" /></label></div>
              <div class="lp-contrib__actions">
                <button class="btn btn--primary btn--lg btn-cut" type="submit" id="lp-submit-btn">Submit for review</button>
                ${spinner(true)}
                <p class="lp-contrib__msg" id="lp-submit-msg" role="status" aria-live="polite"></p>
              </div>
            </form>
          </div>
        </section>
      </div>
    `);
  }

  function hydrate(root) {
    const photoForm = root.querySelector("#lp-photo-form"), manual = root.querySelector("#lp-submit-form");
    const body = root.querySelector("#submit-body"), done = root.querySelector("#submit-done");
    const doneText = root.querySelector("#submit-done-text");
    const modeBtns = root.querySelectorAll(".lp-contrib__modes [data-mode]");

    function showDone(text) {
      doneText.textContent = text;
      body.hidden = true; done.hidden = false;
      done.scrollIntoView({ block: "center" });
    }
    root.querySelector("#submit-again").addEventListener("click", () => {
      done.hidden = true; body.hidden = false;
      body.scrollIntoView({ block: "start" });
    });
    modeBtns.forEach((b) => b.addEventListener("click", () => {
      const photo = b.dataset.mode === "photo";
      photoForm.hidden = !photo; manual.hidden = photo;
      modeBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }));

    hydratePhotos(photoForm, showDone);
    hydrateManual(manual, showDone);
  }

  function hydratePhotos(form, showDone) {
    const items = []; // { id, dataUrl, barcode }
    let nextId = 1, busy = 0;
    const thumbs = form.querySelector("#lp-photo-thumbs"), countEl = form.querySelector("#lp-photo-count");
    const bcIn = form.querySelector("#lp-photo-barcode"), bcNote = form.querySelector("#lp-photo-barcode-note");
    const msg = form.querySelector("#lp-photo-msg"), btn = form.querySelector("#lp-photo-btn");
    const say = (text, kind) => { msg.textContent = text; msg.dataset.kind = kind || ""; };
    let typed = false; // the person edited the barcode themselves, so a photo read never overwrites it

    function render() {
      thumbs.innerHTML = items.map((it, i) => `
        <li class="lp-contrib__thumb"><img src="${it.dataUrl}" alt="Photo ${i + 1}" />
          <button type="button" class="lp-contrib__rm" data-id="${it.id}" aria-label="Remove photo ${i + 1}">\u00D7</button></li>`).join("") +
        (busy ? `<li class="lp-contrib__thumb lp-contrib__thumb--busy" aria-label="Preparing photo">${spinner(false)}</li>` : "");
      countEl.textContent = `${items.length} of ${MAX_PHOTOS} photos`;
      const found = items.find((it) => it.barcode);
      if (!typed) bcIn.value = found ? found.barcode : "";
      bcNote.textContent = found && !typed ? `Barcode read from photo ${items.indexOf(found) + 1}. Check it matches the digits on the pack.`
        : "We try to read the barcode from your photos. If that fails, type the digits under the bars.";
    }

    async function addFiles(fileList) {
      const files = Array.from(fileList || []).filter((f) => /^image\//.test(f.type) || !f.type);
      if (!files.length) return;
      const room = MAX_PHOTOS - items.length - busy;
      if (room <= 0) return say(`You can add up to ${MAX_PHOTOS} photos. Remove one to add another.`, "error");
      if (files.length > room) say(`Only ${MAX_PHOTOS} photos are allowed, so the first ${room} were added.`, "info"); else say("");
      for (const file of files.slice(0, room)) {
        busy++; render();
        try { const r = await LabelScan.prepare(file); items.push({ id: nextId++, dataUrl: r.dataUrl, barcode: r.barcode }); }
        catch (e) { say(e.message || "That photo could not be used.", "error"); }
        busy--; render();
      }
    }
    for (const [btnId, inId] of [["#lp-photo-cam", "#lp-photo-cam-in"], ["#lp-photo-up", "#lp-photo-up-in"]]) {
      const input = form.querySelector(inId);
      form.querySelector(btnId).addEventListener("click", () => input.click());
      input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
    }
    thumbs.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-id]");
      if (!rm) return;
      const i = items.findIndex((it) => String(it.id) === rm.dataset.id);
      if (i >= 0) items.splice(i, 1);
      render();
    });
    bcIn.addEventListener("input", () => { typed = bcIn.value.trim() !== ""; if (!typed) render(); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return say("Still preparing your photos, one moment.", "info");
      if (!items.length) return say("Add at least one photo of the label.", "error");
      const barcode = bcIn.value.replace(/[\s-]/g, "");
      if (!/^\d{8,14}$/.test(barcode)) return say("Enter the barcode, 8 to 14 digits.", "error");
      if (!LabelScan.gs1Ok(barcode)) return say("That barcode does not look right. Check the digits and try again.", "error");
      btn.disabled = true; setBusy(form, true); say("Sending photos and reading the label. This can take a few seconds\u2026");
      const payload = { images: items.map((it) => it.dataUrl), barcode, website: form.elements.website.value };
      const url = ApiClient.buildUrl(AppState.state.baseUrl, "/packaged/scan", {}, {});
      const r = await ApiClient.execute({ url, method: "POST", headers: ApiClient.buildHeaders({ hasBody: true }), body: JSON.stringify(payload) });
      btn.disabled = false; setBusy(form, false);
      const j = r.bodyJson || {};
      if (r.networkError) return say("Could not reach the server. Check your connection and try again.", "error");
      if (r.status === 201 || r.status === 200) {
        items.length = 0; typed = false; render(); say("");
        return showDone("Your photos were read and the food will appear after review." + (j.needs_review ? " Some numbers may need a second look, so a reviewer will check them." : ""));
      }
      if (r.status === 409) return say(j.message || "This barcode has already been submitted.", "info");
      if (r.status === 422) return say(j.message || "We could not read a nutrition label in those photos. Try again with the label flat, sharp and well lit.", "error");
      if (r.status === 413) return say("The photos are too large. Remove one or retake them.", "error");
      if (r.status === 429) return say("Too many submissions right now. Please wait a minute and try again.", "error");
      say(j.message || j.error || "Something went wrong. Please try again.", "error");
    });
    render();
  }

  function hydrateManual(form, showDone) {
    const msg = form.querySelector("#lp-submit-msg"), btn = form.querySelector("#lp-submit-btn");
    const per = form.elements.per, wrap = form.querySelector("#lp-serving-wrap");
    const say = (text, kind) => { msg.textContent = text; msg.dataset.kind = kind || ""; };
    per.addEventListener("change", () => { wrap.hidden = per.value !== "serving"; });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = form.elements;
      const payload = { per: f.per.value };
      for (const k of ["product_name", "barcode", "brand", "ingredients_text", "website"]) payload[k] = f[k].value.trim();
      payload.barcode = payload.barcode.replace(/[\s-]/g, "");
      if (per.value === "serving") payload.serving_size = f.serving_size.value.trim();
      for (const [k, l, req] of NUTRIENTS) {
        const v = f[k].value.trim().replace(",", ".");
        if (!v) { if (req) return say(`${l} is required.`, "error"); continue; }
        if (!/^\d+(\.\d+)?$/.test(v)) return say(`${l} must be a number.`, "error");
        payload[k] = Number(v);
      }
      if (payload.product_name.length < 2) return say("Please enter the product name.", "error");
      if (!/^\d{8,14}$/.test(payload.barcode)) return say("The barcode should be 8 to 14 digits.", "error");
      if (per.value === "serving" && !payload.serving_size) return say("Please add the serving size, for example 30g.", "error");
      btn.disabled = true; setBusy(form, true); say("Sending\u2026");
      const url = ApiClient.buildUrl(AppState.state.baseUrl, "/packaged/submit", {}, {});
      const r = await ApiClient.execute({ url, method: "POST", headers: ApiClient.buildHeaders({ hasBody: true }), body: JSON.stringify(payload) });
      btn.disabled = false; setBusy(form, false);
      const j = r.bodyJson || {};
      if (r.networkError) return say("Could not reach the server. Check your connection and try again.", "error");
      if (r.status === 201 || r.status === 200) {
        form.reset(); wrap.hidden = true; say("");
        return showDone("It will appear after review." + (j.needs_review ? " Its calories do not closely match the nutrients entered, so please double-check the label." : ""));
      }
      if (r.status === 409) return say(j.message || "This barcode has already been submitted.", "info");
      if (r.status === 429) return say("Too many submissions right now. Please wait a minute and try again.", "error");
      say(j.message || j.error || "Something went wrong. Please try again.", "error");
    });
  }

  function render(container) {
    container.innerHTML = "";
    const root = page();
    container.appendChild(root);
    hydrate(root);
  }

  return { render };
})();
