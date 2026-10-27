// Progress bar used wherever the site waits on something. Determinate ({ pct }) shows a percentage that starts at 0%;
// indeterminate ({ run: true }) is for work with no measurable progress, so it shows a moving bar and no percentage.
const Progress = (() => {
  const clamp = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0);
  const pctText = (n) => +clamp(n).toFixed(0) + "%";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function html({ text = "", pct = 0, run = false, id = "" } = {}) {
    const p = clamp(pct);
    return `<div class="progress${run ? " progress--indeterminate" : ""}"${id ? ` id="${esc(id)}"` : ""}>`
      + `<div class="progress__row"><span class="progress__text">${esc(text)}</span><b class="progress__pct">${run ? "" : pctText(p)}</b></div>`
      + `<div class="progress__track" role="progressbar" aria-label="${esc(text || "Progress")}" aria-valuemin="0" aria-valuemax="100"${run ? "" : ` aria-valuenow="${Math.round(p)}"`}>`
      + `<span class="progress__fill"${run ? "" : ` style="width:${p}%"`}></span></div></div>`;
  }

  // Update a bar made by html(): pass the .progress element (or its parent), the new percentage and optional text.
  function set(root, pct, text) {
    const bar = root && (root.matches?.(".progress") ? root : root.querySelector?.(".progress"));
    if (!bar) return;
    const p = clamp(pct);
    bar.querySelector(".progress__fill").style.width = p + "%";
    bar.querySelector(".progress__pct").textContent = pctText(p);
    bar.querySelector(".progress__track").setAttribute("aria-valuenow", String(Math.round(p)));
    if (text != null) bar.querySelector(".progress__text").textContent = text;
  }

  return { html, set };
})();
