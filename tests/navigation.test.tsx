import React, { useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Workspace } from "../src/components/workspace";
import { WorkspaceLink } from "../src/components/workspace-link";
import { dateLabel, dayKey } from "../src/domain/vocabulary";
import { vocabulary } from "./fixtures/dictionary";

vi.mock("../src/application/auth-actions", () => ({ startSignIn: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () =>
    useSyncExternalStore(
      (listener) => {
        window.addEventListener("popstate", listener);
        return () => window.removeEventListener("popstate", listener);
      },
      () => window.location.pathname,
    ),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => ({
    data: { user: { id: "owner" }, expires: "2027-10-12" },
    status: "authenticated",
  }),
  getSession: vi.fn(),
  signOut: vi.fn(),
  signIn: vi.fn(),
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            entries: [{ ...vocabulary, day: dayKey() }],
            total: 1,
          }),
        ),
    ),
  );
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const pushState = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((...args) => {
    pushState(...args);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount() {
  render(
    <Workspace
      mode="live"
      session={{ user: { id: "owner" }, expires: "2027-10-12" }}
      providers={[]}
      initialSnapshot={{
        kind: "loaded",
        userId: "owner",
        today: dayKey(),
        entries: [{ ...vocabulary, day: dayKey() }],
      }}
    >
      {null}
    </Workspace>,
  );
}

it("loads History separately and keeps Today available when navigating back", async () => {
  mount();
  expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "History" }));
  expect(window.location.pathname).toBe("/history");
  expect(screen.getByRole("heading", { name: "History" })).toBeVisible();
  expect(await screen.findByRole("heading", { name: "ought" })).toBeVisible();
  expect(screen.queryByText(dateLabel(dayKey()))).toBeNull();
  expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  expect(screen.getByRole("link", { name: "History" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  fireEvent.click(screen.getByRole("link", { name: "Today" }));
  expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
  expect(window.location.pathname).toBe("/");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("renders a direct History URL and responds to browser history changes", async () => {
  window.history.replaceState(null, "", "/history");
  mount();
  expect(screen.getByRole("heading", { name: "History" })).toBeVisible();
  await screen.findByRole("heading", { name: "ought" });
  act(() => {
    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("prefetches the next History page and reuses cached pages", async () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const requested = new URL(String(input), "http://localhost:3000");
    const page = Number(requested.searchParams.get("page"));
    return new Response(
      JSON.stringify({
        entries: [
          {
            ...vocabulary,
            id: `page-${page}`,
            word: `page${page}`,
            day: dayKey(),
          },
        ],
        total: 201,
      }),
    );
  });
  window.history.replaceState(null, "", "/history");
  mount();
  expect(await screen.findByRole("heading", { name: "page1" })).toBeVisible();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByRole("heading", { name: "page2" })).toBeVisible();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(await screen.findByRole("heading", { name: "page1" })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("searches the entire History collection and starts results on page one", async () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const requested = new URL(String(input), "http://localhost:3000");
    const search = requested.searchParams.get("search");
    const page = Number(requested.searchParams.get("page"));
    return new Response(
      JSON.stringify({
        entries: [
          {
            ...vocabulary,
            id: search ? "matching-old-word" : `page-${page}`,
            word: search ? "rescind" : `page${page}`,
            day: search ? "2020-01-01" : dayKey(),
          },
        ],
        total: search ? 1 : 201,
      }),
    );
  });
  window.history.replaceState(null, "", "/history");
  mount();
  expect(await screen.findByRole("heading", { name: "page1" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByRole("heading", { name: "page2" })).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search words" }), {
    target: { value: "rescind" },
  });
  expect(await screen.findByRole("heading", { name: "rescind" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  expect(screen.getByText("1 word")).toBeVisible();
  expect(
    vi.mocked(fetch).mock.calls.some(([input]) => {
      const requested = new URL(String(input), "http://localhost:3000");
      return (
        requested.searchParams.get("search") === "rescind" &&
        requested.searchParams.get("page") === "1"
      );
    }),
  ).toBe(true);
});

it.each([
  { ctrlKey: true },
  { metaKey: true },
  { shiftKey: true },
  { altKey: true },
  { button: 1 },
])("preserves modified browser link behavior %j", (options) => {
  render(<WorkspaceLink href="/history">History</WorkspaceLink>);
  let preventedByLink = true;
  document.addEventListener(
    "click",
    (event) => {
      preventedByLink = event.defaultPrevented;
      event.preventDefault();
    },
    { once: true },
  );
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    ...options,
  });
  screen.getByRole("link").dispatchEvent(event);
  expect(preventedByLink).toBe(false);
  expect(window.history.pushState).not.toHaveBeenCalled();
});

it("does not append a history entry when clicking the current view", () => {
  render(<WorkspaceLink href="/">Today</WorkspaceLink>);
  fireEvent.click(screen.getByRole("link"));
  expect(window.history.pushState).not.toHaveBeenCalled();
  expect(window.scrollTo).not.toHaveBeenCalled();
});
