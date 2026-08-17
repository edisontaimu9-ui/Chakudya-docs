const ThemeModule = (() => {
  const KEY = "chakudya-docs:theme";

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(KEY, theme); } catch (_) { /* storage unavailable - theme just won't persist */ }
  }

  function current() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function init() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (_) { /* ignore */ }
    if (saved === "light" || saved === "dark") {
      apply(saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      apply("light");
    }

    const btn = document.getElementById("theme-toggle");
    btn?.addEventListener("click", () => {
      apply(current() === "dark" ? "light" : "dark");
    });
  }

  return { init, current, apply };
})();
