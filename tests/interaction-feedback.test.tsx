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
import { AuthPanel } from "../src/components/auth-panel";
import { Workspace } from "../src/components/workspace";
import { vocabulary } from "./fixtures/dictionary";
import { dayKey } from "../src/domain/vocabulary";
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), startSignIn: vi.fn() }));
const authState = vi.hoisted(() => ({ authenticated: true }));
vi.mock("../src/application/auth-actions", () => ({
  startSignIn: mocks.startSignIn,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => ({
    data: authState.authenticated ? { user: { id: "first" } } : null,
    status: authState.authenticated ? "authenticated" : "unauthenticated",
  }),
  getSession: vi.fn(),
  signOut: mocks.signOut,
}));
const providers = [
  { id: "google", name: "Google", enabled: true },
] satisfies Parameters<typeof Workspace>[0]["providers"];
function mount() {
  return render(
    <Workspace
      mode="live"
      session={{ user: { id: "first" }, expires: "2027-01-01" }}
      providers={providers}
      initialSnapshot={{
        kind: "loaded",
        userId: "first",
        today: dayKey(),
        entries: [{ ...vocabulary, day: dayKey() }],
      }}
    >
      <span />
    </Workspace>,
  );
}
beforeEach(() => {
  authState.authenticated = true;
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it("navigates after sign-in starts without flashing a false error", async () => {
  const destination = new URL("/#oauth-started", window.location.href);
  mocks.startSignIn.mockResolvedValue(destination.href);
  render(<AuthPanel providers={providers} />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  await waitFor(() => expect(window.location.hash).toBe("#oauth-started"));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: "Connecting…" })).toBeDisabled();
});
it("shows a real sign-in startup failure and allows another attempt", async () => {
  mocks.startSignIn.mockRejectedValue(new Error("Provider unavailable"));
  render(<AuthPanel providers={providers} />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't start sign-in",
    ),
  );
  expect(
    screen.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
});
it("hides private words immediately while real sign-out is pending", async () => {
  let finish = () => {};
  mocks.signOut.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const mounted = mount();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.queryByRole("heading", { name: "ought" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Continue with Google" }),
  ).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Signing out");
  await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
  await act(async () => finish());
  expect(screen.getByRole("status")).toHaveTextContent("Signing out");
  authState.authenticated = false;
  mounted.rerender(
    <Workspace mode="live" session={null} providers={providers}>
      <span />
    </Workspace>,
  );
  expect(
    screen.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
});
it("does not clear the session cookie when database revocation fails", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "session is still active",
    ),
  );
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Continue with Google" }),
  ).toBeNull();
});
it("never reports a failed revocation as a completed logout and permits retry", async () => {
  mocks.signOut
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({});
  const mounted = mount();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "session is still active",
    ),
  );
  expect(
    screen.queryByRole("button", { name: "Continue with Google" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Signing out"),
  );
  authState.authenticated = false;
  mounted.rerender(
    <Workspace mode="live" session={null} providers={providers}>
      <span />
    </Workspace>,
  );
  expect(
    screen.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  expect(mocks.signOut).toHaveBeenCalledTimes(2);
});
it("warms a paused valid input without saving it", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Add a word" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Word" }), {
    target: { value: "serene" },
  });
  await waitFor(
    () =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/words",
        expect.objectContaining({ method: "PUT", body: '{"word":"serene"}' }),
      ),
    { timeout: 1500 },
  );
  expect(screen.queryByRole("heading", { name: "serene" })).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
