const SearchModule = (() => {
  function applyFilter(query) {
    const q = query.trim().toLowerCase();
    const groups = document.querySelectorAll(".nav-group");

    groups.forEach((group) => {
      const items = group.querySelectorAll(".nav-item");
      let visibleCount = 0;
      items.forEach((item) => {
        const match = !q || item.dataset.search.includes(q);
        item.classList.toggle("is-hidden", !match);
        if (match) visibleCount++;
      });
      group.classList.toggle("is-empty", visibleCount === 0);
      if (q && visibleCount > 0) group.classList.remove("is-collapsed");
    });
  }

  function init() {
    const headerInput = document.getElementById("global-search");
    const sidebarInput = document.getElementById("sidebar-search");

    function onInput(e) {
      const value = e.target.value;
      if (e.target !== headerInput) headerInput.value = value;
      if (e.target !== sidebarInput) sidebarInput.value = value;
      applyFilter(value);
      AppState.set({ searchQuery: value });
    }

    headerInput.addEventListener("input", onInput);
    sidebarInput.addEventListener("input", onInput);

    // "/" focuses search, like most dev-tool docs sites.
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault();
        headerInput.focus();
      }
      if (e.key === "Escape" && document.activeElement === headerInput) {
        headerInput.blur();
      }
    });
  }

  return { init, applyFilter };
})();
