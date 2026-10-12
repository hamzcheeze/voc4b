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
  SessionProvider,
  useSession,
  signOut,
  getSession,
} from "next-auth/react";
import type { Session } from "next-auth";
import type { AuthProviderOption } from "../application/auth-providers";
import { AuthPanel } from "./auth-panel";
import type { AppMode } from "../application/config";
import {
  dayKey,
  vocabularySchema,
  type Vocabulary,
} from "../domain/vocabulary";
import { demoStore } from "../adapters/demo";
import { ThemeToggle } from "./theme-toggle";
import { Icon } from "./icon";
export type InitialWorkspaceSnapshot =
  | { kind: "loaded"; userId: string; today: string; entries: Vocabulary[] }
  | { kind: "failed"; userId: string; today: string; error: string };
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
  session,
  providers,
  initialSnapshot,
}: {
  children: React.ReactNode;
  mode: AppMode;
  session: Session | null;
  providers: AuthProviderOption[];
  initialSnapshot?: InitialWorkspaceSnapshot;
}) {
  return (
    <SessionProvider
      session={session}
      refetchOnWindowFocus={false}
      refetchInterval={3600}
    >
      <SessionWorkspace
        mode={mode}
        providers={providers}
        initialSnapshot={initialSnapshot}
      >
        {children}
      </SessionWorkspace>
    </SessionProvider>
  );
}
function SessionWorkspace({
  children,
  mode,
  providers,
  initialSnapshot,
}: {
  children: React.ReactNode;
  mode: AppMode;
  providers: AuthProviderOption[];
  initialSnapshot?: InitialWorkspaceSnapshot;
}) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const [bootstrap, setBootstrap] = useState(() => ({
    userId,
    snapshot: initialSnapshot,
  }));
  if (bootstrap.userId !== userId) {
    setBootstrap({ userId, snapshot: undefined });
  }
  useEffect(() => {
    if (mode === "live" && userId) void getSession({ broadcast: false });
  }, [mode, userId]);
  return (
    <WorkspaceContent
      key={session?.user?.id || "anonymous"}
      session={session}
      authReady={status !== "loading"}
      mode={mode}
      providers={providers}
      initialSnapshot={
        bootstrap.userId === userId ? bootstrap.snapshot : undefined
      }
    >
      {children}
    </WorkspaceContent>
  );
}
function WorkspaceContent({
  children,
  mode,
  providers,
  session,
  authReady,
  initialSnapshot,
}: {
  children: React.ReactNode;
  mode: AppMode;
  providers: AuthProviderOption[];
  session: Session | null;
  authReady: boolean;
  initialSnapshot?: InitialWorkspaceSnapshot;
}) {
  const path = usePathname();
  const userId = session?.user?.id;
  const [seed] = useState(() =>
    mode === "live" && userId && initialSnapshot?.userId === userId
      ? initialSnapshot
      : undefined,
  );
  const [entries, setEntries] = useState<Vocabulary[]>(
      seed?.kind === "loaded" ? seed.entries : [],
    ),
    [loading, setLoading] = useState(!seed),
    [error, setError] = useState(seed?.kind === "failed" ? seed.error : ""),
    [today, setToday] = useState(seed?.today ?? dayKey());
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    setError("");
    try {
      let rows: Vocabulary[];
      if (mode === "demo") rows = demoStore.list();
      else if (mode === "live" && userId) {
        const response = await fetch("/api/words", {
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
    if (!authReady || seed) return;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [authReady, refresh, seed]);
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
      if (!userId) throw new Error("Please sign in again.");
      const response = await fetch("/api/words", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ word }),
      });
      const data = await response.json();
      if (!response.ok) {
        await refresh();
        throw new Error(data.error);
      }
      const entry = vocabularySchema.parse(data.entry);
      generation.current++;
      setEntries((rows) => [
        entry,
        ...rows.filter((row) => row.id !== entry.id),
      ]);
      setToday(dayKey());
      setError("");
      setLoading(false);
      return;
    }
    await refresh();
  }
  async function remove(id: string) {
    if (mode === "demo") await demoStore.removeToday(id);
    else {
      if (!userId) throw new Error("Please sign in again.");
      const response = await fetch(`/api/words?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        await refresh();
        throw new Error(data.error);
      }
      generation.current++;
      setEntries((rows) => rows.filter((row) => row.id !== id));
      setToday(dayKey());
      setError("");
      setLoading(false);
      return;
    }
    await refresh();
  }
  return (
    <Context.Provider
      value={{ entries, loading, error, mode, today, refresh, add, remove }}
    >
      <div className="app-shell">
        {(mode === "demo" || (mode === "live" && authReady && session)) && (
          <header className="masthead">
            <Link href="/" className="brand" aria-label="Voc4b · Home">
              <Icon name="notebook" />
              <span className="wordmark">Voc4b</span>
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
              {mode === "live" && session && (
                <button
                  className="text-button"
                  onClick={() =>
                    void signOut({ redirect: false }).catch(() =>
                      setError("Couldn't sign out. Please try again."),
                    )
                  }
                >
                  Sign out
                </button>
              )}
            </div>
          </header>
        )}
        <main id="main-content">
          {mode === "unconfigured" ? (
            <section className="setup-panel">
              <h1>Connection setup</h1>
              <p>
                Configure authentication as described in the README to get
                started.
              </p>
            </section>
          ) : !authReady ? (
            <p role="status" className="loading">
              Loading…
            </p>
          ) : mode === "live" && !session ? (
            <AuthPanel providers={providers} />
          ) : (
            children
          )}
        </main>
      </div>
    </Context.Provider>
  );
}
