import React from "react";
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
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { Workspace, useWorkspace } from "../src/components/workspace";
import TodayPage from "../src/app/page";
import { vocabulary } from "./fixtures/dictionary";
import { dayKey } from "../src/domain/vocabulary";
const auth = vi.hoisted(() => ({
  listeners: new Set<
    (event: AuthChangeEvent, session: Session | null) => void
  >(),
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: auth.getSession,
      onAuthStateChange: (
        listener: (event: AuthChangeEvent, session: Session | null) => void,
      ) => {
        auth.listeners.add(listener);
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      },
    },
  }),
}));
function session(id = "first", token = "initial-token"): Session {
  return {
    access_token: token,
    refresh_token: "refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-10-11T00:00:00Z",
    },
  };
}
function Controls() {
  const { refresh } = useWorkspace();
  return <button onClick={() => void refresh()}>Refresh test data</button>;
}
function mount() {
  return render(
    <Workspace mode="live">
      <TodayPage />
      <Controls />
    </Workspace>,
  );
}
const saved = { ...vocabulary, day: dayKey() };
beforeEach(() => {
  auth.listeners.clear();
  auth.getSession.mockResolvedValue({
    data: { session: session() },
    error: null,
  });
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
function emit(event: AuthChangeEvent, value: Session | null) {
  if (!auth.listeners.size) throw new Error("Auth listener missing");
  act(() => auth.listeners.forEach((listener) => listener(event, value)));
}
it.each([
  "SIGNED_IN",
  "TOKEN_REFRESHED",
  "USER_UPDATED",
] satisfies AuthChangeEvent[])(
  "keeps words visible without fetching again on same-user %s",
  async (event) => {
    mount();
    expect(await screen.findByRole("heading", { name: "ought" })).toBeVisible();
    const fetcher = vi.mocked(fetch);
    const requests = fetcher.mock.calls.length;
    emit(event, session("first", "new-token"));
    fireEvent.focus(window);
    expect(screen.getByRole("heading", { name: "ought" })).toBeVisible();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fetcher.mock.calls).toHaveLength(requests);
    fireEvent.click(screen.getByRole("button", { name: "Refresh test data" }));
    await waitFor(() => expect(fetcher.mock.calls).toHaveLength(requests + 1));
    expect(fetcher.mock.lastCall?.[1]?.headers).toEqual({
      Authorization: "Bearer new-token",
    });
    expect(await screen.findByRole("heading", { name: "ought" })).toBeVisible();
  },
);
it("clears the old user's words on sign out", async () => {
  mount();
  await screen.findByRole("heading", { name: "ought" });
  emit("SIGNED_OUT", null);
  expect(
    screen.queryByRole("heading", { name: "ought" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
it("hides the old user's words and loads the new user's data on account change", async () => {
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
  emit("SIGNED_IN", session("second", "second-token"));
  expect(
    screen.queryByRole("heading", { name: "ought" }),
  ).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "rescind" })).toBeVisible();
  expect(vi.mocked(fetch).mock.lastCall?.[1]?.headers).toEqual({
    Authorization: "Bearer second-token",
  });
});
it("ignores an older bootstrap session after a newer auth event", async () => {
  const bootstrap = Promise.withResolvers<{
    data: { session: Session };
    error: null;
  }>();
  auth.getSession.mockReturnValue(bootstrap.promise);
  mount();
  emit("SIGNED_IN", session("second", "second-token"));
  await screen.findByRole("heading", { name: "ought" });
  await act(async () =>
    bootstrap.resolve({ data: { session: session() }, error: null }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh test data" }));
  await waitFor(() =>
    expect(vi.mocked(fetch).mock.lastCall?.[1]?.headers).toEqual({
      Authorization: "Bearer second-token",
    }),
  );
});
it("keeps an in-flight word load valid when the same user's token refreshes", async () => {
  const pending = Promise.withResolvers<Response>();
  const fetcher = vi.fn(() => pending.promise);
  vi.stubGlobal("fetch", fetcher);
  mount();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  emit("TOKEN_REFRESHED", session("first", "new-token"));
  await act(async () =>
    pending.resolve(new Response(JSON.stringify({ entries: [saved] }))),
  );
  expect(await screen.findByRole("heading", { name: "ought" })).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
