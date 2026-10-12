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
  const { refresh, add, remove } = useWorkspace();
  return (
    <>
      <button onClick={() => void refresh()}>Refresh test data</button>
      <button onClick={() => void add("rescind")}>Add test word</button>
      <button onClick={() => void remove("1")}>Remove test word</button>
    </>
  );
}
const providers = [
  { id: "google", name: "Google", enabled: true },
  { id: "facebook", name: "Facebook", enabled: false },
  { id: "chatgpt", name: "ChatGPT", enabled: false },
] satisfies Parameters<typeof Workspace>[0]["providers"];
function mount(
  initialSnapshot?: Parameters<typeof Workspace>[0]["initialSnapshot"],
) {
  return render(
    <Workspace
      mode="live"
      session={authentication.session}
      providers={providers}
      initialSnapshot={initialSnapshot}
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

it("renders the server owner's words immediately without another list request", async () => {
  mount({ kind: "loaded", userId: "first", today: dayKey(), entries: [saved] });
  expect(screen.getByRole("heading", { name: "ought" })).toBeVisible();
  expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(fetch).not.toHaveBeenCalled();
});
it("does not expose another owner's server snapshot", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ entries: [] }))),
  );
  mount({
    kind: "loaded",
    userId: "second",
    today: dayKey(),
    entries: [saved],
  });
  expect(
    screen.queryByRole("heading", { name: "ought" }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(
    screen.queryByRole("heading", { name: "ought" }),
  ).not.toBeInTheDocument();
});
it("shows a server load failure immediately and lets the user retry", async () => {
  mount({
    kind: "failed",
    userId: "first",
    today: dayKey(),
    error: "Couldn't load your words.",
  });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Couldn't load your words.",
  );
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "ought" })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("loads a new account rather than reusing the previous owner's seed", async () => {
  mount({ kind: "loaded", userId: "first", today: dayKey(), entries: [saved] });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            entries: [{ ...saved, id: "second", word: "rescind" }],
          }),
        ),
    ),
  );
  emit(session("second"));
  expect(
    screen.queryByRole("heading", { name: "ought" }),
  ).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "rescind" })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("reloads the same account after signout rather than restoring its old server seed", async () => {
  mount({ kind: "loaded", userId: "first", today: dayKey(), entries: [saved] });
  emit(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            entries: [{ ...saved, id: "replacement", word: "rescind" }],
          }),
        ),
    ),
  );
  emit(session());
  expect(
    screen.queryByRole("heading", { name: "ought" }),
  ).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "rescind" })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("shows a saved word from the POST response without reloading the library", async () => {
  const added = { ...saved, id: "new-word", word: "rescind" };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ entry: added }), { status: 201 }),
    ),
  );
  mount({ kind: "loaded", userId: "first", today: dayKey(), entries: [saved] });
  fireEvent.click(screen.getByRole("button", { name: "Add test word" }));
  expect(await screen.findByRole("heading", { name: "rescind" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "ought" })).toBeVisible();
  expect(screen.getByLabelText("2 of 2 words saved")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.lastCall?.[1]?.method).toBe("POST");
});
it("does not let an older list response erase a completed addition", async () => {
  const pending = Promise.withResolvers<Response>();
  const added = { ...saved, id: "new-word", word: "rescind" };
  const fetcher = vi.fn((_url: RequestInfo | URL, options?: RequestInit) =>
    options?.method === "POST"
      ? Promise.resolve(
          new Response(JSON.stringify({ entry: added }), { status: 201 }),
        )
      : pending.promise,
  );
  vi.stubGlobal("fetch", fetcher);
  mount({ kind: "loaded", userId: "first", today: dayKey(), entries: [saved] });
  fireEvent.click(screen.getByRole("button", { name: "Refresh test data" }));
  fireEvent.click(screen.getByRole("button", { name: "Add test word" }));
  expect(await screen.findByRole("heading", { name: "rescind" })).toBeVisible();
  await act(async () => {
    pending.resolve(new Response(JSON.stringify({ entries: [saved] })));
  });
  expect(screen.getByRole("heading", { name: "rescind" })).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("removes a confirmed word locally without letting an older load restore it", async () => {
  const pending = Promise.withResolvers<Response>();
  const fetcher = vi.fn((_url: RequestInfo | URL, options?: RequestInit) =>
    options?.method === "DELETE"
      ? Promise.resolve(new Response(null, { status: 204 }))
      : pending.promise,
  );
  vi.stubGlobal("fetch", fetcher);
  mount({ kind: "loaded", userId: "first", today: dayKey(), entries: [saved] });
  fireEvent.click(screen.getByRole("button", { name: "Refresh test data" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove test word" }));
  await waitFor(() =>
    expect(screen.getByLabelText("0 of 2 words saved")).toBeVisible(),
  );
  await act(async () => {
    pending.resolve(new Response(JSON.stringify({ entries: [saved] })));
  });
  expect(
    screen.queryByRole("heading", { name: "ought" }),
  ).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
