const CopyModule = (() => {
  function toast(message) {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Fallback for contexts without Clipboard API permissions.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
  }

  /** Wires a .copy-btn element to copy the given text (or a getter fn). */
  function bind(btn, textOrFn) {
    btn.addEventListener("click", async () => {
      const text = typeof textOrFn === "function" ? textOrFn() : textOrFn;
      const ok = await copyText(text);
      if (ok) {
        btn.classList.add("is-copied");
        const original = btn.dataset.label || btn.textContent;
        btn.dataset.label = original;
        btn.textContent = "Copied";
        toast("Copied to clipboard");
        setTimeout(() => {
          btn.classList.remove("is-copied");
          btn.textContent = original;
        }, 1400);
      } else {
        toast("Couldn't copy — copy it manually");
      }
    });
  }

  return { copyText, bind, toast };
})();
