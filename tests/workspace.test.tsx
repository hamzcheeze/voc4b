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
import type { Session } from "next-auth";
import { Workspace, useWorkspace } from "../src/components/workspace";
import TodayPage from "../src/app/page";
import { vocabulary } from "./fixtures/dictionary";
import { dayKey } from "../src/domain/vocabulary";
const authentication = vi.hoisted(() => ({
  session: null as Session | null,
  listeners: new Set<() => void>(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => {
    const data = useSyncExternalStore(
      (listener) => {
        authentication.listeners.add(listener);
        return () => authentication.listeners.delete(listener);
      },
      () => authentication.session,
    );
    return { data, status: data ? "authenticated" : "unauthenticated" };
  },
  signIn: authentication.signIn,
  signOut: authentication.signOut,
  getSession: vi.fn(),
}));
function session(id = "first"): Session {
  return {
    expires: "2027-10-11T00:00:00Z",
    user: { id, email: "user@gmail.com" },
  };
}
function Controls() {
  const { refresh } = useWorkspace();
  return <button onClick={() => void refresh()}>Refresh test data</button>;
}
const providers = [
  { id: "google", name: "Google", enabled: true },
  { id: "facebook", name: "Facebook", enabled: false },
  { id: "chatgpt", name: "ChatGPT", enabled: false },
] satisfies Parameters<typeof Workspace>[0]["providers"];
function mount() {
  return render(
    <Workspace
      mode="live"
      session={authentication.session}
      providers={providers}
    >
      <TodayPage />
      <Controls />
    </Workspace>,
  );
}
const saved = { ...vocabulary, day: dayKey() };
beforeEach(() => {
  authentication.session = session();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ entries: [saved] }))),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function emit(value: Session | null) {
  act(() => {
    authentication.session = value;
    authentication.listeners.forEach((listener) => listener());
  });
}
it("keeps words visible without fetching on same-user session renewal and focus", async () => {
  mount();
  expect(await screen.findByRole("heading", { name: "ought" })).toBeVisible();
  const requests = vi.mocked(fetch).mock.calls.length;
  emit({ ...session(), expires: "2028-10-11T00:00:00Z" });
  fireEvent.focus(window);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(screen.getByRole("heading", { name: "ought" })).toBeVisible();
  expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(requests);
  fireEvent.click(screen.getByRole("button", { name: "Refresh test data" }));
  await waitFor(() =>
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(requests + 1),
  );
  expect(vi.mocked(fetch).mock.lastCall?.[1]?.headers).toBeUndefined();
});
it("shows login immediately for a server-confirmed absent session", () => {
  authentication.session = null;
  mount();
  expect(
    screen.getByRole("heading", { name: "Sign in to Voc4b" }),
  ).toBeVisible();
  expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Continue with Facebook" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Continue with ChatGPT" }),
  ).toBeDisabled();
});
it("clears the previous user's words on signout", async () => {
  mount();
  await screen.findByRole("heading", { name: "ought" });
  emit(null);
  expect(
    screen.queryByRole("heading", { name: "ought" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Sign in to Voc4b" }),
  ).toBeVisible();
});
it("hides previous words and loads the new owner's words on account change", async () => {
  mount();
  await screen.findByRole("heading", { name: "ought" });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            entries: [{ ...saved, id: "second-word", word: "rescind" }],
          }),
        ),
    ),
  );
  emit(session("second"));
  expect(
    screen.queryByRole("heading", { name: "ought" }),
  ).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "rescind" })).toBeVisible();
});
it("keeps an in-flight load valid during the same owner's session renewal", async () => {
  const pending = Promise.withResolvers<Response>();
  const fetcher = vi.fn(() => pending.promise);
  vi.stubGlobal("fetch", fetcher);
  mount();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  emit({ ...session(), expires: "2028-10-11T00:00:00Z" });
  await act(async () =>
    pending.resolve(new Response(JSON.stringify({ entries: [saved] }))),
  );
  expect(await screen.findByRole("heading", { name: "ought" })).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
