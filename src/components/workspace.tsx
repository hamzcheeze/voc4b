"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createClient,
  type SupabaseClient,
  type Session,
} from "@supabase/supabase-js";
import type { AppMode } from "../application/config";
import { dayKey, type Vocabulary } from "../domain/vocabulary";
import { demoStore } from "../adapters/demo";
import { ThemeToggle } from "./theme-toggle";
import { Icon } from "./icon";
interface WorkspaceState {
  entries: Vocabulary[];
  loading: boolean;
  error: string;
  mode: AppMode;
  today: string;
  refresh: () => Promise<void>;
  add: (word: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}
const Context = createContext<WorkspaceState | null>(null);
export function useWorkspace() {
  const state = useContext(Context);
  if (!state) throw new Error("Workspace provider missing");
  return state;
}
export function Workspace({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: AppMode;
}) {
  const path = usePathname();
  const [client] = useState<SupabaseClient | null>(() =>
    mode === "live"
      ? createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
        )
      : null,
  );
  const [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(mode !== "live");
  const [entries, setEntries] = useState<Vocabulary[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [today, setToday] = useState(dayKey());
  const generation = useRef(0);
  const currentSession = useRef<Session | null>(null);
  const userId = session?.user.id;
  useEffect(() => {
    if (!client) return;
    let active = true;
    let authEventReceived = false;
    const updateSession = (next: Session | null) => {
      if (currentSession.current?.user.id !== next?.user.id) {
        generation.current++;
        setEntries([]);
        setLoading(true);
        setError("");
      }
      currentSession.current = next;
      setSession(next);
      setAuthReady(true);
    };
    client.auth.getSession().then(({ data, error }) => {
      if (active && !authEventReceived) {
        if (error) setError("Couldn't verify your session.");
        updateSession(data.session);
      }
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      authEventReceived = true;
      if (active) updateSession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    setError("");
    try {
      let rows: Vocabulary[];
      if (mode === "demo") rows = demoStore.list();
      else if (mode === "live" && userId && currentSession.current) {
        const response = await fetch("/api/words", {
          headers: {
            Authorization: `Bearer ${currentSession.current.access_token}`,
          },
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        rows = data.entries;
      } else rows = [];
      if (version === generation.current) {
        setEntries(rows);
        setToday(dayKey());
      }
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : "Couldn't load your words.");
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [mode, userId]);
  useEffect(() => {
    if (!authReady) return;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [authReady, refresh]);
  useEffect(() => {
    const check = () => {
      if (dayKey() !== today) {
        setToday(dayKey());
        void refresh();
      }
    };
    const timer = setInterval(check, 15000);
    window.addEventListener("focus", check);
    const storage = (event: StorageEvent) => {
      if (mode === "demo" && event.key === "two-words-demo-v2") void refresh();
    };
    window.addEventListener("storage", storage);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", storage);
    };
  }, [today, refresh, mode]);
  async function add(word: string) {
    if (mode === "demo") await demoStore.add(word);
    else {
      if (!client) throw new Error("The app isn't ready yet.");
      const {
        data: { session: current },
      } = await client.auth.getSession();
      if (!current) throw new Error("Please sign in again.");
      const response = await fetch("/api/words", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${current.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ word }),
      });
      const data = await response.json();
      if (!response.ok) {
        await refresh();
        throw new Error(data.error);
      }
    }
    await refresh();
  }
  async function remove(id: string) {
    if (mode === "demo") await demoStore.removeToday(id);
    else {
      if (!client) throw new Error("The app isn't ready yet.");
      const {
        data: { session: current },
      } = await client.auth.getSession();
      if (!current) throw new Error("Please sign in again.");
      const response = await fetch(`/api/words?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${current.access_token}` },
      });
      if (!response.ok) {
        const data = await response.json();
        await refresh();
        throw new Error(data.error);
      }
    }
    await refresh();
  }
  return (
    <Context.Provider
      value={{ entries, loading, error, mode, today, refresh, add, remove }}
    >
      <div className="app-shell">
        <header className="masthead">
          <Link href="/" className="brand" aria-label="voc4b · Home">
            <Icon name="notebook" />
            <span>voc4b</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/" aria-current={path === "/" ? "page" : undefined}>
              Today
            </Link>
            <Link
              href="/history"
              aria-current={path === "/history" ? "page" : undefined}
            >
              History
            </Link>
          </nav>
          <div className="account-tools">
            <ThemeToggle />
            {mode === "demo" && (
              <details className="mode-menu">
                <summary title="Sample data">Demo</summary>
                <div className="mode-popover">
                  <p>Sample words · stored on this device</p>
                  <p>No dictionary API or Supabase connection</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      demoStore.reset();
                      void refresh();
                    }}
                  >
                    Reset demo
                  </button>
                </div>
              </details>
            )}
            {session && client && (
              <button
                className="text-button"
                onClick={() =>
                  void client.auth.signOut().then(({ error }) => {
                    if (error) setError("Couldn't sign out. Please try again.");
                  })
                }
              >
                Sign out
              </button>
            )}
          </div>
        </header>
        <main id="main-content">
          {mode === "unconfigured" ? (
            <section className="setup-panel">
              <h1>Connection setup</h1>
              <p>
                Add your Supabase keys as described in the README to get
                started.
              </p>
            </section>
          ) : !authReady ? (
            <p role="status" className="loading">
              Loading…
            </p>
          ) : mode === "live" && !session && client ? (
            <AuthPanel client={client} />
          ) : (
            children
          )}
        </main>
      </div>
    </Context.Provider>
  );
}
function AuthPanel({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = signup
        ? await client.auth.signUp({ email, password })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setMessage(
          "Account created. Check your email to confirm it before signing in.",
        );
    } catch {
      setError(
        signup
          ? "Couldn't create your account. Check your email and password, then try again."
          : "Couldn't sign in. Check your password and confirm your email, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-panel">
      <h1>Sign in</h1>
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          minLength={8}
          required
          autoComplete={signup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </button>
      </form>
      {process.env.NEXT_PUBLIC_ALLOW_SIGNUP === "true" && (
        <button
          className="text-button"
          onClick={() => {
            setSignup(!signup);
            setError("");
            setMessage("");
          }}
        >
          {signup
            ? "Already have an account? Sign in"
            : "Need an account? Sign up"}
        </button>
      )}
    </section>
  );
}
