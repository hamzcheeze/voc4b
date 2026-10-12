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
  session,
  providers,
}: {
  children: React.ReactNode;
  mode: AppMode;
  session: Session | null;
  providers: AuthProviderOption[];
}) {
  return (
    <SessionProvider
      session={session}
      refetchOnWindowFocus={false}
      refetchInterval={3600}
    >
      <SessionWorkspace mode={mode} providers={providers}>
        {children}
      </SessionWorkspace>
    </SessionProvider>
  );
}
function SessionWorkspace({
  children,
  mode,
  providers,
}: {
  children: React.ReactNode;
  mode: AppMode;
  providers: AuthProviderOption[];
}) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
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
}: {
  children: React.ReactNode;
  mode: AppMode;
  providers: AuthProviderOption[];
  session: Session | null;
  authReady: boolean;
}) {
  const path = usePathname();
  const [entries, setEntries] = useState<Vocabulary[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [today, setToday] = useState(dayKey());
  const generation = useRef(0);
  const userId = session?.user?.id;
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
