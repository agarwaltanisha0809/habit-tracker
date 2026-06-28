// Dark mode toggle — persisted independently of habit data.
const THEME_KEY = "habitTracker.theme";

function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

function initTheme() {
  applyTheme(getStoredTheme());
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = getStoredTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
    });
  }
}
