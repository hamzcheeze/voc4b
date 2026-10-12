"use client";
import React, { useEffect, useSyncExternalStore } from "react";
import { Icon } from "./icon";
export type Theme = "light" | "dark";
import { THEME_KEY } from "./theme-script";
export { THEME_KEY } from "./theme-script";
const CHANGE_EVENT = "two-words-theme-change";
function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}
export function getPreferredTheme(): Theme {
  return (
    savedTheme() ??
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light")
  );
}
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* Appearance still works without storage. */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const notify = () => onChange();
  const onSystemChange = () => {
    if (!savedTheme()) {
      document.documentElement.dataset.theme = getPreferredTheme();
      onChange();
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) {
      document.documentElement.dataset.theme = getPreferredTheme();
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSystemChange);
  };
}
const getSnapshot = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";
const getServerSnapshot = (): Theme => "light";
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (!document.documentElement.dataset.theme) {
      document.documentElement.dataset.theme = getPreferredTheme();
      window.dispatchEvent(new Event(CHANGE_EVENT));
    }
  }, []);
  const label =
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
