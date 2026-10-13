/**
 * Legal pages - routes "#/legal/<id>".
 * Privacy Policy, Terms of Use, Data Sources & Attribution, Clinical Disclaimer.
 * Reuses the docs page styles (doc-page, doc-body, section, callout).
 */
const RenderLegal = (() => {
  const UPDATED = "13 October 2026";
  const REPO = "https://github.com/edisontaimu9-ui/chakudya-api";
  const ISSUES = REPO + "/issues";

  const PAGES = [
    { id: "privacy", title: "Privacy Policy", lead: "What this site and the Chakudya API collect, why, and the choices you have." },
    { id: "terms", title: "Terms of Use", lead: "The rules for using the Chakudya documentation, API and data." },
    { id: "data-sources", title: "Data Sources & Attribution", lead: "Where the data comes from, how it is licensed and how to credit it." },
    { id: "disclaimer", title: "Clinical Disclaimer", lead: "Chakudya supports clinical decisions. It does not make them." },
  ];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  const has = (id) => PAGES.some((p) => p.id === id);
  const sec = (id, title, html) => `<section class="section doc-section" id="legal-${id}"><h2 class="section__title">${title}</h2>${html}</section>`;
  const p = (html) => `<p class="endpoint-desc">${html}</p>`;
  const ul = (items) => `<ul class="legal-list">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  const note = (html, danger) => `<div class="callout${danger ? " callout--danger" : ""}">${html}</div>`;
  const EMAIL = "edisontaimu9@gmail.com";
  const contact = `Questions or requests? Email <a href="mailto:${EMAIL}">${EMAIL}</a>, or open an issue on <a href="${ISSUES}" target="_blank" rel="noopener">GitHub</a>.`;

  /* ───────── content ───────── */

  const BODY = {
    privacy: () => [
      note("<strong>Short version:</strong> we only collect what is needed to run the API and your developer account. We do not sell personal data and the docs site has no advertising or analytics trackers."),
      sec("collect", "What we collect", ul([
        "<strong>Developer account (optional).</strong> If you create an account to get an API key: your email address and a password (stored hashed by our authentication provider, Supabase), or your Google account email if you use Google sign-in.",
        "<strong>API requests.</strong> Each request to the API gets a request ID and a short log line (route, status, timing and your API-key or client label where one is used). Request logs are used for security, rate limiting, debugging and capacity planning.",
        "<strong>FHIR audit events.</strong> Requests under <code>/fhir</code> create an audit record containing the route, outcome, request ID and the key label. Request and response bodies, query strings, tokens and full IP addresses are not recorded (IP addresses are truncated).",
        "<strong>NutriMind questions.</strong> Questions you ask Chakudya NutriMind are sent to the Chakudya API to generate an answer. Your chat history is saved only in your browser. We do not ask for your name or contact details.",
        "<strong>Your own inputs.</strong> Measurements and food entries you send to calculation routes are processed to return a result. Calculation routes are stateless unless a route is documented as storing data.",
      ])),
      sec("browser", "Stored on your device", p("The docs site saves a few settings in your browser so it works the way you left it. None of them identify you.") + ul([
        "Theme (dark or light), your preferred code-sample language, and which sidebar groups are collapsed.",
        "Your NutriMind chat history. Use <strong>New chat</strong> to clear it.",
        "A sign-in session, only if you sign in. Consumer API keys are never saved in your browser storage.",
        "An offline copy of the docs (service worker cache), so the site opens without a connection.",
      ])),
      sec("third", "Services we rely on", ul([
        "<strong>Cloudflare</strong> hosts and runs the API and may process network data such as IP addresses to deliver and protect the service.",
        "<strong>Supabase</strong> provides sign-in and developer-account storage.",
        "<strong>Google</strong> serves the fonts used on this site and, if you choose it, Google sign-in.",
      ]) + p("Each provider handles data under its own privacy policy.")),
      sec("use", "How we use data", ul([
        "To run, secure and improve the API and these docs.",
        "To manage your account and API keys and to apply fair rate limits.",
        "To answer support and bug reports.",
      ]) + p("We do not sell personal data and we do not use it for advertising.")),
      sec("health", "Do not send patient identifiers", note("Chakudya is a reference and calculation service, not a patient record system. Please do not send names, national IDs, phone numbers or other direct patient identifiers. Send only the measurements a calculation needs. If you build a clinical app on top of the API, you are responsible for protecting patient data in your own system and for complying with the health-data and data-protection law that applies to you.", true)),
      sec("keep", "Retention and your choices", p("Account details are kept while your account is active. Logs are kept only as long as needed for security and operations. You can ask us to access, correct or delete your account data, or to revoke an API key, at any time. " + contact)),
      sec("children", "Children", p("The developer account is for adults and professionals. Growth routes work with child measurements supplied by the caller; see the note above about identifiers.")),
      sec("changes", "Changes", p(`We may update this policy as the service changes. The date at the top of the page shows the latest revision.`)),
    ],

    terms: () => [
      note("By using the Chakudya website, API or data you agree to these terms. If you do not agree, please do not use the service."),
      sec("service", "The service", p("Chakudya Nutrition Registry provides food composition data, WHO growth assessment, clinical nutrition calculators, FHIR workflows and developer documentation for Malawi and beyond. Features may change, and we may add, limit or remove routes with reasonable notice where possible.")),
      sec("use", "Acceptable use", ul([
        "Use the API within published rate limits. Do not try to evade them or overload the service.",
        "Keep your API keys secret. You are responsible for activity under your keys. Never ship a key in browser code.",
        "Do not attempt to access data you are not authorised to access, probe for vulnerabilities without permission, or disrupt the service.",
        "Do not use the service to build tools that mislead people about their health or that present screening output as a diagnosis.",
        "Do not extract, republish or redistribute licensed datasets in ways their licence forbids (see Data Sources &amp; Attribution).",
      ])),
      sec("clinical", "Not medical advice", p("Outputs are screening and decision-support information only. They are not a diagnosis or treatment plan and do not replace professional judgment. Read the <a href=\"#/legal/disclaimer\">Clinical Disclaimer</a>.")),
      sec("accounts", "Accounts and keys", p("We may suspend or revoke accounts and keys that break these terms, put the service at risk or are inactive for a long period. You may stop using the service or ask us to delete your account at any time.")),
      sec("ip", "Content and licences", p("The documentation, branding and original code are owned by Chakudya Nutrition Registry unless a file states otherwise. Third-party data keeps the licence of its source. Please follow the credit requirements in <a href=\"#/legal/data-sources\">Data Sources &amp; Attribution</a>.")),
      sec("availability", "Availability and changes", p("We work to keep the API reliable but do not guarantee uninterrupted or error-free service. We may change or retire routes, and we will try to flag breaking changes in the documentation.")),
      sec("warranty", "No warranty", p("The service and data are provided <strong>as is</strong> and <strong>as available</strong>, without warranties of any kind. Food composition values are reference values; real foods vary by variety, season, preparation and brand.")),
      sec("liability", "Limitation of liability", p("To the fullest extent permitted by law, Chakudya Nutrition Registry and its contributors are not liable for indirect or consequential loss, or for decisions made using the service. Nothing here limits liability that cannot be limited by law.")),
      sec("law", "Governing law", p("These terms are governed by the laws of Malawi. " + contact)),
      sec("changes", "Changes to these terms", p("We may revise these terms. Continued use after an update means you accept the revised terms.")),
    ],

    "data-sources": () => [
      note("Data is shown with its source wherever possible. Individual routes return citations, and the Fenton route returns its full citation and licence text from <code>/fenton-preterm/references</code>."),
      sec("food", "Food composition and serving sizes", p("Food records are drawn from food composition table (FCT) data for Malawian and commonly eaten foods, with values given per 100 g or 100 ml. Household serving sizes are tagged by origin: the food's own FCT measure, a curated local-foods match, or a generic category estimate. Always check the <code>source</code> field on a serving size.")),
      sec("who", "WHO growth references", p("Child growth routes use the World Health Organization growth references (L, M and S values, z-scores and percentiles), including weight-for-age, length/height-for-age, weight-for-length/height, BMI-for-age, head circumference-for-age and arm circumference-for-age. Credit the WHO when you republish derived results.")),
      sec("fenton", "Fenton preterm growth charts", p("Preterm growth uses the 2013 (Fenton &amp; Kim, <em>BMC Pediatrics</em> 2013;13:59) and 2025 (Fenton, Elmrayed &amp; Alshaikh, <em>Paediatric and Perinatal Epidemiology</em>) references. The underlying values were provided by Dr. Tanis Fenton, University of Calgary, under <a href=\"https://creativecommons.org/licenses/by-nc-nd/4.0/\" target=\"_blank\" rel=\"noopener\">CC BY-NC-ND 4.0</a> for non-commercial use in this app only.") + note("<strong>Restricted data.</strong> The Fenton L/M/S values are never returned and must not be extracted or shared. The API returns only computed results, static metadata and rendered charts.", true)),
      sec("gi", "Glycaemic index and load", p("Glycaemic values are included only where a published, sourced figure exists and each carries its citation. Malawian nsima values come from Mlotha et al. (2016). Where no published value exists the API says so instead of estimating one.")),
      sec("clinical", "Clinical reference tables", p("Exchange lists, formula, drug-nutrient interaction and other clinical reference tables carry the citation stored with each record. Where a record has no citation, treat it as informational.")),
      sec("standards", "Standards", p("FHIR resources follow HL7 FHIR R4. Observations use LOINC codes where a fit exists, and Chakudya-specific code systems where it does not. HL7 and FHIR are registered trademarks of Health Level Seven International; LOINC is a registered trademark of Regenstrief Institute.")),
      sec("credit", "How to credit us", p("When you display Chakudya data, please credit it as <strong>Chakudya Nutrition Registry</strong> and keep the original source citations that come with the data. Report an error or a missing source on <a href=\"" + ISSUES + "\" target=\"_blank\" rel=\"noopener\">GitHub</a>.")),
    ],

    disclaimer: () => [
      note("<strong>Chakudya provides screening and decision support only. It does not diagnose, treat or replace a qualified health professional.</strong>", true),
      sec("scope", "What the tools are", p("Growth assessment, malnutrition screening, energy and protein estimates, dosing references and other calculators return calculated values and reference information. They are aids for trained users.")),
      sec("judgment", "Professional judgment comes first", ul([
        "Always confirm results against the full clinical picture, current local guidelines and your own assessment.",
        "Do not delay or skip care because of a result from this service.",
        "A normal result does not rule out a problem, and an abnormal result does not confirm one.",
      ])),
      sec("nutrimind", "NutriMind answers", p("Chakudya NutriMind writes its answers with AI, using the registry's data and documents. Answers can be incomplete or wrong. Check anything important against the sources shown and with a qualified health professional, and do not share personal or patient details in the chat.")),
      sec("accuracy", "Accuracy and inputs", p("Results depend on the measurements and units supplied. Check inputs carefully, including age, sex, gestational age and measurement technique. Reference data may change as new editions are published, and food composition values are averages that vary in real life.")),
      sec("emergency", "Emergencies", p("If someone is seriously unwell, seek urgent medical care at the nearest health facility. Do not use this service in an emergency.")),
      sec("developers", "If you build on the API", p("If you show Chakudya results to patients or clinicians, keep a clear screening-aid notice with them and do not present output as a diagnosis. You are responsible for validating the tool for its intended use and for any regulatory requirements that apply to you.")),
      sec("see", "Related", p("See also the <a href=\"#/legal/terms\">Terms of Use</a> and <a href=\"#/legal/privacy\">Privacy Policy</a>.")),
    ],
  };

  function pager(id) {
    return el(`<nav class="legal-nav" aria-label="Legal pages">${PAGES.map((pg) =>
      `<a href="#/legal/${pg.id}"${pg.id === id ? ' aria-current="page"' : ""}>${esc(pg.title)}</a>`).join("")}</nav>`);
  }

  function render(id, container) {
    const meta = PAGES.find((x) => x.id === id);
    container.innerHTML = "";
    const root = el(`
      <div class="doc-page legal-page">
        <p class="eyebrow">Legal</p>
        <h1 class="doc-title"></h1>
        <p class="doc-lead"></p>
        <p class="legal-updated">Last updated ${UPDATED}</p>
      </div>`);
    root.querySelector("h1").textContent = meta.title;
    root.querySelector(".doc-lead").textContent = meta.lead;
    root.appendChild(pager(id));
    const body = el(`<div class="doc-body">${BODY[id]().join("")}</div>`);
    root.appendChild(body);
    root.appendChild(el(`<p class="legal-copy">© ${new Date().getFullYear()} Chakudya Nutrition Registry. All rights reserved.</p>`));
    container.appendChild(root);
    Seo.set(meta.title, meta.lead);
  }

  return { PAGES, has, render };
})();
