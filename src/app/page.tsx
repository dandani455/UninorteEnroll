"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import WeekCalendar from "@/components/WeekCalendar";
import ProjectionPanel from "@/components/ProjectionPanel";
import { useSchedule } from "@/store/schedule";
import { useUser } from "@/store/user";
import GenerateSchedule from "@/components/GenerateSchedule";

/* =================== Utils (fuera del componente) =================== */
function assertOkJson(file: string) {
  return async (r: Response) => {
    if (!r.ok)
      throw new Error(`No se pudo cargar ${file} (status ${r.status})`);
    return r.json();
  };
}

function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Error desconocido";
  }
}

/* =================================================================== */

type ProbeErr = string | null;

export default function HomePage() {
  /** ---------- Hooks (siempre arriba) ---------- */
  const [open, setOpen] = useState(false); // Modal "Mi proyección"
  const [menuOpen, setMenuOpen] = useState(false); // Menú de usuario
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ProbeErr>(null);

  // Suscripciones finas al store (evita re-renders masivos)
  const setData = useSchedule((s) => s.setData);
  const subjects = useSchedule((s) => s.subjects);

  const user = useUser((s) => s.user);
  const setUser = useUser((s) => s.setUser);
  const signOut = useUser((s) => s.signOut);

  const menuRef = useRef<HTMLDivElement>(null);

  /** ---------- Cierra el menú al hacer clic fuera o con ESC ---------- */
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        menuOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  /** ---------- Carga de datos desde /public/data ---------- */
  useEffect(() => {
    (async () => {
      try {
        const [subjects, professors, sections, meetings] = await Promise.all([
          fetch("/data/subjects.json", { cache: "no-store" }).then(
            assertOkJson("subjects.json")
          ),
          fetch("/data/professors.json", { cache: "no-store" }).then(
            assertOkJson("professors.json")
          ),
          fetch("/data/sections.json", { cache: "no-store" }).then(
            assertOkJson("sections.json")
          ),
          fetch("/data/meetings.json", { cache: "no-store" }).then(
            assertOkJson("meetings.json")
          ),
        ]);
        setData({ subjects, professors, sections, meetings });
        setError(null);
      } catch (e) {
        console.error(e);
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [setData]);

  /** ---------- Derivados: semestres/carreras ---------- */
  const SEMESTERS_AVAILABLE = useMemo(() => {
    const s = new Set<number>();
    for (const subj of subjects) {
      const v = (subj as { semester?: unknown }).semester;
      if (typeof v === "number") s.add(v);
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [subjects]);

  const CAREERS_AVAILABLE = useMemo(() => ["Ingeniería de Sistemas"], []);

  /** ---------- UI helpers ---------- */
  function onSubmitWelcome(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();

    const semester =
      SEMESTERS_AVAILABLE.length === 1
        ? SEMESTERS_AVAILABLE[0]
        : Number(fd.get("semester"));

    const career =
      CAREERS_AVAILABLE.length === 1
        ? CAREERS_AVAILABLE[0]
        : String(fd.get("career"));

    if (!name) return alert("Escribe tu nombre");
    if (!semester) return alert("Selecciona semestre");

    setUser({ name, semester, career });
  }

  /** ---------- Estados globales ---------- */
  if (loading) {
    return <p className="p-6">Cargando…</p>;
  }

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <h2>⚠️ Error cargando datos</h2>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error}</pre>
        <p>
          Verifica que los JSON existan en <code>/public/data</code> y recarga:
        </p>
        <ul>
          <li>/public/data/subjects.json</li>
          <li>/public/data/professors.json</li>
          <li>/public/data/sections.json</li>
          <li>/public/data/meetings.json</li>
        </ul>
      </div>
    );
  }

  /** ---------- Pantalla de bienvenida (sin sesión) ---------- */
  if (!user) {
    return (
      <main className="welcome-wrap">
        <form onSubmit={onSubmitWelcome} className="form-card">
          <h1 className="form-title">Bienvenido</h1>

          <div className="field">
            <label className="label" htmlFor="name">
              Nombre
            </label>
            <input
              id="name"
              name="name"
              className="input"
              placeholder="Tu nombre"
              autoFocus
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="career">
              Carrera
            </label>
            {CAREERS_AVAILABLE.length === 1 ? (
              <>
                <input
                  type="hidden"
                  name="career"
                  value={CAREERS_AVAILABLE[0]}
                />
                <select id="career" className="select" disabled>
                  <option>{CAREERS_AVAILABLE[0]}</option>
                </select>
              </>
            ) : (
              <select
                id="career"
                name="career"
                className="select"
                defaultValue={CAREERS_AVAILABLE[0]}
              >
                {CAREERS_AVAILABLE.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="field">
            <label className="label" htmlFor="semester">
              Semestre
            </label>
            {SEMESTERS_AVAILABLE.length === 1 ? (
              <>
                <input
                  type="hidden"
                  name="semester"
                  value={SEMESTERS_AVAILABLE[0]}
                />
                <select id="semester" className="select" disabled>
                  <option>{SEMESTERS_AVAILABLE[0]}° semestre</option>
                </select>
              </>
            ) : (
              <select
                id="semester"
                name="semester"
                className="select"
                defaultValue={SEMESTERS_AVAILABLE[0]}
              >
                {SEMESTERS_AVAILABLE.map((s) => (
                  <option key={s} value={s}>
                    {s}° semestre
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-actions">
            <button className="btn btn-green btn-full">Continuar</button>
          </div>
        </form>
      </main>
    );
  }

  /** ---------- App (con sesión) ---------- */
  return (
    <>
      <header className="topbar">
        <div className="topbar__wrap">
          {/* Brand (izquierda) */}
          <div className="brand">
            <div className="brand__logo" />
            <div className="brand__title">UNIVERSIDAD DEL NORTE</div>
          </div>

          {/* Acciones (derecha) */}
          <div className="flex items-center gap-3">
            {/* Mostrar grafo */}
            <Link
              href="/graph"
              className="btn-slate flex items-center gap-2"
              title="Ver grafo de NRC"
            >
              <span>🧩</span>
              <span>Mostrar grafo</span>
            </Link>

            {/* Generar horario (botón + modal interno) */}
            <GenerateSchedule />

            {/* Mi proyección */}
            <button className="btn btn-green" onClick={() => setOpen(true)}>
              <span aria-hidden>📅</span>
              <span>Mi proyección</span>
            </button>

            {/* User menu (anclado en relativo) */}
            <div ref={menuRef} className="user-menu">
              <button
                className="user-trigger"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                {user.name.toUpperCase()} ▾
              </button>

              {menuOpen && (
                <div role="menu" className="dropdown">
                  <div className="dropdown__info">
                    {user.career} · {user.semester}°
                  </div>
                  <button
                    role="menuitem"
                    className="dropdown__item"
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto mt-6">
        <div className="calendar-shell p-4">
          <WeekCalendar />
        </div>
      </div>

      <ProjectionPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
