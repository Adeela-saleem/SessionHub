/* ============================================================
   SessionHub — Theme toggle
   Self-contained: injects a button, persists choice, no deps.
   Does not touch any existing element or handler.
   ============================================================ */
(function () {
  var KEY = "sessionhub-theme";
  var root = document.documentElement;

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);

  function current() {
    var attr = root.getAttribute("data-theme");
    if (attr) return attr;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';

  function build() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", "Toggle colour theme");
    btn.setAttribute("title", "Toggle colour theme");

    function paint() {
      var isDark = current() === "dark";
      btn.innerHTML = isDark ? SUN : MOON;
      btn.setAttribute("aria-pressed", String(isDark));
    }
    paint();

    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
      paint();
    });

    // Landing header, else dashboard topbar, else float bottom-right.
    var host = document.querySelector(".site-header .auth-actions");
    if (host) { host.insertBefore(btn, host.firstChild); return; }

    host = document.querySelector(".dash-topbar");
    if (host) {
      var chip = host.querySelector(".dash-user-chip");
      if (chip && chip.parentNode) chip.parentNode.insertBefore(btn, chip);
      else host.appendChild(btn);
      return;
    }

    btn.classList.add("theme-toggle-float");
    document.body.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
