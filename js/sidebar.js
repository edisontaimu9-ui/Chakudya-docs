const Sidebar = (() => {
  const COLLAPSE_KEY = "chakudya-docs:collapsed-groups";

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function loadCollapsed() {
    try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]")); }
    catch (_) { return new Set(); }
  }
  function saveCollapsed(set) {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch (_) { /* ignore */ }
  }

  function render() {
    const { groups, endpoints } = AppState.state;
    const container = document.getElementById("sidebar-groups");
    const collapsed = loadCollapsed();
    container.innerHTML = "";

    groups.forEach((group) => {
      const groupEl = el(`
        <div class="nav-group" data-tag="${RenderEndpoint.escapeHtml(group.tag)}">
          <button class="nav-group__head" type="button">
            <svg class="nav-group__chevron" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span></span>
            <span class="nav-group__count">${group.endpoints.length}</span>
          </button>
          <ul class="nav-group__list"></ul>
        </div>
      `);
      groupEl.querySelector(".nav-group__head span:not(.nav-group__count)").textContent = group.tag;
      if (collapsed.has(group.tag)) groupEl.classList.add("is-collapsed");

      groupEl.querySelector(".nav-group__head").addEventListener("click", () => {
        groupEl.classList.toggle("is-collapsed");
        const set = loadCollapsed();
        if (groupEl.classList.contains("is-collapsed")) set.add(group.tag);
        else set.delete(group.tag);
        saveCollapsed(set);
      });

      const list = groupEl.querySelector(".nav-group__list");
      group.endpoints.forEach((ep) => {
        const item = el(`
          <li class="nav-item" data-id="${ep.id}" data-search="${RenderEndpoint.escapeHtml((ep.summary + " " + ep.path + " " + ep.method).toLowerCase())}">
            <a class="nav-item__link" href="#/${ep.slug}">
              <span class="badge-method badge-method--${ep.method}">${ep.method}</span>
              <span class="nav-item__path"></span>
            </a>
          </li>
        `);
        item.querySelector(".nav-item__path").textContent = ep.path;
        item.querySelector(".nav-item__path").title = ep.summary;
        list.appendChild(item);
      });

      container.appendChild(groupEl);
    });

    document.getElementById("endpoint-count").textContent = `${endpoints.length} endpoints`;
  }

  function setActive(id) {
    document.querySelectorAll(".nav-item").forEach((item) => {
      const isActive = item.dataset.id === id;
      item.classList.toggle("is-active", isActive);
      if (isActive) {
        item.scrollIntoView({ block: "nearest" });
        const group = item.closest(".nav-group");
        if (group && group.classList.contains("is-collapsed")) {
          group.classList.remove("is-collapsed");
        }
      }
    });
  }

  return { render, setActive };
})();
