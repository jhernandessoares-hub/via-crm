export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "via-theme";
export const ADMIN_THEME_STORAGE_KEY = "via-admin-theme";

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (theme === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}

export function getStoredTheme(key: string): Theme | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(key);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

export function setStoredTheme(key: string, theme: Theme) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, theme);
  } catch {
    /* localStorage indisponível (modo privado etc.) — segue sem cache */
  }
}
