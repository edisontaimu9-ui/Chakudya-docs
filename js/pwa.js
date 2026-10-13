/* PWA glue: service worker registration, update prompt, install button, connectivity toasts.
 * Registers only on https:// or localhost (service workers are not allowed elsewhere). */
const PwaModule = (() => {
  const secure = location.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  let deferredPrompt = null;
  let userInitiatedReload = false;

  function stack() { return document.getElementById("toast-stack"); }

  function actionToast(message, actions) {
    const host = stack();
    if (!host) return null;
    const el = document.createElement("div");
    el.className = "toast toast--action";
    el.setAttribute("role", "status");
    const text = document.createElement("span");
    text.textContent = message;
    el.appendChild(text);
    actions.forEach(({ label, primary, onClick }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "toast__btn" + (primary ? " toast__btn--primary" : "");
      b.textContent = label;
      b.addEventListener("click", () => { el.remove(); onClick && onClick(); });
      el.appendChild(b);
    });
    host.appendChild(el);
    return el;
  }

  function promptUpdate(worker) {
    if (document.querySelector(".toast--update")) return;
    const el = actionToast("A new version of the docs is ready.", [
      { label: "Reload", primary: true, onClick: () => { userInitiatedReload = true; worker.postMessage({ type: "SKIP_WAITING" }); } },
      { label: "Later" },
    ]);
    if (el) el.classList.add("toast--update");
  }

  function trackInstalling(reg) {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener("statechange", () => {
      // "installed" with an existing controller means this is an update, not the first install.
      if (w.state === "installed" && navigator.serviceWorker.controller) promptUpdate(w);
    });
  }

  async function register() {
    if (!("serviceWorker" in navigator) || !secure) return;
    try {
      const reg = await navigator.serviceWorker.register("sw.js", { scope: "./", updateViaCache: "none" });
      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => trackInstalling(reg));
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    } catch (_) { /* the site works without a service worker */ }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Reload only when the user asked for the update, never on first install.
      if (userInitiatedReload) location.reload();
    });
  }

  function initInstall() {
    const btn = document.getElementById("install-btn");
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (btn) btn.hidden = false;
    });
    if (btn) btn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      const p = deferredPrompt;
      deferredPrompt = null;
      btn.hidden = true;
      p.prompt();
      try { await p.userChoice; } catch (_) { /* ignore */ }
    });
    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      if (btn) btn.hidden = true;
      CopyModule.toast("Chakudya installed");
    });
  }

  function initConnectivity() {
    window.addEventListener("offline", () => CopyModule.toast("You're offline. Saved docs still work; live data won't load."));
    window.addEventListener("online", () => CopyModule.toast("Back online"));
  }

  function isOffline() { return navigator.onLine === false; }

  function init() {
    initInstall();
    initConnectivity();
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }

  return { init, isOffline };
})();
PwaModule.init();
