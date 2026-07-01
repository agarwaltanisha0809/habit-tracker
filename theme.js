// Theme toggle. True black is the default; this switches to light mode.
const THEME_KEY = "habitTracker.theme";

function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = theme === "light" ? "🌙" : "☀️";
}

function initTheme() {
  applyTheme(getStoredTheme());
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = getStoredTheme() === "light" ? "dark" : "light";
      applyTheme(next);
      if (typeof refreshApp === "function") refreshApp();
    });
  }
}
