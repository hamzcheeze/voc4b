import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  getPreferredTheme,
  setTheme,
  ThemeToggle,
  THEME_KEY,
} from "../src/components/theme-toggle";
beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("starts with the system dark preference when no choice is saved", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  expect(getPreferredTheme()).toBe("dark");
});
it("explicit saved choice takes priority over system preference", () => {
  localStorage.setItem(THEME_KEY, "dark");
  expect(getPreferredTheme()).toBe("dark");
});
it("ignores an invalid saved theme", () => {
  localStorage.setItem(THEME_KEY, "green");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  expect(getPreferredTheme()).toBe("dark");
});
it("applies and persists a selected mode", () => {
  setTheme("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem(THEME_KEY)).toBe("dark");
});
it("still changes appearance when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage denied");
  });
  expect(() => setTheme("dark")).not.toThrow();
  expect(document.documentElement.dataset.theme).toBe("dark");
});
it("the accessible control toggles both ways", () => {
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
  expect(document.documentElement.dataset.theme).toBe("light");
});
