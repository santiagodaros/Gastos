import { useState, useEffect } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "gastos-theme";

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "dark" || stored === "light") return stored;
  } catch { /* noop */ }
  return "dark"; // default
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Apply on mount (before first paint)
  useEffect(() => {
    applyTheme(getInitialTheme());
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
  }

  return { theme, toggleTheme };
}
