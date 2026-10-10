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
  useEffect(() => {
    if (!client) return;
    let active = true;
    client.auth.getSession().then(({ data, error }) => {
      if (active) {
        if (error) setError("ตรวจสอบเซสชันไม่สำเร็จ");
        setSession(data.session);
        setAuthReady(true);
      }
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      generation.current++;
      setEntries([]);
      setSession(next);
      setAuthReady(true);
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
      else if (mode === "live" && session) {
        const response = await fetch("/api/words", {
          headers: { Authorization: `Bearer ${session.access_token}` },
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
        setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [mode, session]);
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
      if (!client) throw new Error("ระบบยังไม่พร้อมใช้งาน");
      const {
        data: { session: current },
      } = await client.auth.getSession();
      if (!current) throw new Error("กรุณาเข้าสู่ระบบใหม่");
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
  return (
    <Context.Provider
      value={{ entries, loading, error, mode, today, refresh, add }}
    >
      <div className="app-shell">
        <header className="masthead">
          <Link href="/" className="brand" aria-label="voc4b · หน้าหลัก">
            <Icon name="notebook" />
            <span>voc4b</span>
          </Link>
          <nav aria-label="เมนูหลัก">
            <Link href="/" aria-current={path === "/" ? "page" : undefined}>
              วันนี้
            </Link>
            <Link
              href="/history"
              aria-current={path === "/history" ? "page" : undefined}
            >
              คลังคำศัพท์
            </Link>
          </nav>
          <div className="account-tools">
            <ThemeToggle />
            {mode === "demo" && (
              <details className="mode-menu">
                <summary title="ข้อมูลตัวอย่าง">เดโม</summary>
                <div className="mode-popover">
                  <p>คำตัวอย่าง · เก็บในเครื่อง</p>
                  <p>ไม่ได้เรียก Dictionary API หรือ Supabase</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      demoStore.reset();
                      void refresh();
                    }}
                  >
                    ล้างเดโม
                  </button>
                </div>
              </details>
            )}
            {session && client && (
              <button
                className="text-button"
                onClick={() =>
                  void client.auth.signOut().then(({ error }) => {
                    if (error) setError("ออกจากระบบไม่สำเร็จ");
                  })
                }
              >
                ออกจากระบบ
              </button>
            )}
          </div>
        </header>
        <main id="main-content">
          {mode === "unconfigured" ? (
            <section className="setup-panel">
              <h1>ตั้งค่าการเชื่อมต่อ</h1>
              <p>กรอก Supabase keys ตาม README เพื่อเริ่มใช้งาน</p>
            </section>
          ) : !authReady ? (
            <p role="status" className="loading">
              กำลังโหลด…
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
        setMessage("สมัครแล้ว โปรดยืนยันอีเมลก่อนเข้าสู่ระบบ");
    } catch {
      setError(
        signup
          ? "สมัครไม่สำเร็จ ตรวจสอบอีเมลและรหัสผ่าน หรือลองใหม่ภายหลัง"
          : "เข้าสู่ระบบไม่สำเร็จ ตรวจสอบรหัสผ่านและยืนยันอีเมลแล้วลองใหม่",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-panel">
      <h1>เข้าสู่ระบบ</h1>
      <form onSubmit={submit}>
        <label htmlFor="email">อีเมล</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="password">รหัสผ่าน</label>
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
          {busy ? "กำลังดำเนินการ…" : signup ? "สมัครบัญชี" : "เข้าสู่ระบบ"}
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
          {signup ? "มีบัญชีแล้ว? เข้าสู่ระบบ" : "ยังไม่มีบัญชี? สมัครฟรี"}
        </button>
      )}
    </section>
  );
}
