"use client";

import { useMemo, useState } from "react";
import { useSchedule } from "@/store/schedule";

/* ================= helpers tiempo ================= */
type TMoment = string | number | Date;

const toMin = (x: TMoment): number => {
  if (typeof x === "number") return x;
  if (x instanceof Date) return x.getHours() * 60 + x.getMinutes();
  const [h, m] = String(x).split(":").map(Number);
  return h * 60 + (m || 0);
};

type PrefShift = "any" | "morning" | "afternoon" | "evening";
const inShift = (startMin: number, pref: PrefShift) => {
  if (pref === "any") return true;
  if (pref === "morning") return startMin >= 6 * 60 && startMin < 12 * 60;
  if (pref === "afternoon") return startMin >= 12 * 60 && startMin < 18 * 60;
  // evening
  return startMin >= 18 * 60 && startMin <= 22 * 60 + 30;
};

/* ============== Componente ============== */

type Props = {
  asButton?: boolean; // renderiza el botón "✨ Generar horario"
  buttonClassName?: string; // estilizar el botón externo
};

export default function GenerateSchedule({
  asButton = true,
  buttonClassName = "btn btn-ghost",
}: Props) {
  const { sections, meetings, graph, selected, toggle } = useSchedule();

  const [open, setOpen] = useState(false);
  const [prefShift, setPrefShift] = useState<PrefShift>("any");
  const [maxGap, setMaxGap] = useState<number>(60); // 0,60,120,180,Infinity
  const [compactDays, setCompactDays] = useState<boolean>(true);
  const [respectSelected, setRespectSelected] = useState<boolean>(true);
  const [lastSummary, setLastSummary] = useState<string>("");

  // índices rápidos
  const secByNrc = useMemo(
    () => new Map(sections.map((s) => [s.nrc, s])),
    [sections]
  );

  const meetsByNrc = useMemo(() => {
    const m = new Map<string, { day: string; start: number; end: number }[]>();
    for (const x of meetings) {
      const arr = m.get(x.nrc) ?? [];
      arr.push({ day: x.day, start: toMin(x.start), end: toMin(x.end) });
      m.set(x.nrc, arr);
    }
    return m;
  }, [meetings]);

  // subjectCode -> NRC[] (ordenados por cercanía al turno preferido)
  const subjectsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of sections) {
      const arr = map.get(s.subjectCode) ?? [];
      arr.push(s.nrc);
      map.set(s.subjectCode, arr);
    }
    for (const [subj, arr] of map) {
      arr.sort((a, b) => {
        const A = (meetsByNrc.get(a) ?? [])[0];
        const B = (meetsByNrc.get(b) ?? [])[0];
        const sa = A ? A.start : 12 * 60;
        const sb = B ? B.start : 12 * 60;
        const pa = inShift(sa, prefShift) ? 0 : 1;
        const pb = inShift(sb, prefShift) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return sa - sb;
      });
    }
    return map;
  }, [sections, meetsByNrc, prefShift]);

  /* ---------- scoring del horario ---------- */
  function scoreSelection(pick: Set<string>) {
    const dayMap = new Map<string, Array<{ start: number; end: number }>>();
    let prefPenalty = 0;

    for (const nrc of pick) {
      const mm = meetsByNrc.get(nrc) ?? [];
      for (const m of mm) {
        if (!dayMap.has(m.day)) dayMap.set(m.day, []);
        dayMap.get(m.day)!.push({ start: m.start, end: m.end });
        if (!inShift(m.start, prefShift)) prefPenalty += 10;
      }
    }

    let gapPenalty = 0;
    let spreadPenalty = 0;

    for (const [, arr] of dayMap) {
      arr.sort((a, b) => a.start - b.start);
      for (let i = 1; i < arr.length; i++) {
        const gap = Math.max(0, arr[i].start - arr[i - 1].end);
        if (maxGap !== Infinity && gap > maxGap)
          gapPenalty += (gap - maxGap) * 2;
        gapPenalty += Math.floor(gap / 15);
      }
      if (compactDays && arr.length >= 2) {
        const span = arr[arr.length - 1].end - arr[0].start;
        spreadPenalty += Math.floor(span / 30);
      }
    }

    const daysUsed = dayMap.size;
    if (compactDays) spreadPenalty += Math.max(0, daysUsed - 3) * 8;

    return prefPenalty + gapPenalty + spreadPenalty;
  }

  /* ---------- verificador con el grafo ---------- */
  function isCompatibleWith(pick: Set<string>, candidate: string) {
    const neigh = graph.get(candidate);
    if (!neigh) return true;
    for (const u of pick) if (neigh.has(u)) return false;
    return true;
  }

  /* ---------- construcción (multi–inicio) ---------- */
  function buildSchedule(respectFixed: boolean): {
    best: Set<string>;
    score: number;
    reason?: string;
  } {
    const mandatory = respectFixed ? new Set([...selected]) : new Set<string>();

    // si los fijos chocan entre sí → aborta con razón explícita
    for (const a of mandatory) {
      for (const b of mandatory) {
        if (a === b) continue;
        const neigh = graph.get(a);
        if (neigh && neigh.has(b)) {
          return {
            best: new Set(),
            score: Number.POSITIVE_INFINITY,
            reason:
              "Los NRC seleccionados actualmente tienen conflictos entre sí.",
          };
        }
      }
    }

    const allSubjects = [...new Set(sections.map((s) => s.subjectCode))];

    let best = new Set<string>(mandatory);
    let bestScore = scoreSelection(best);

    const RESTARTS = 40;
    for (let r = 0; r < RESTARTS; r++) {
      const pick = new Set<string>(mandatory);

      // materias más conflictivas primero (por grado total de sus NRC)
      const subjSorted = allSubjects.slice().sort((A, B) => {
        const degA = (subjectsMap.get(A) ?? []).reduce(
          (acc, n) => acc + (graph.get(n)?.size ?? 0),
          0
        );
        const degB = (subjectsMap.get(B) ?? []).reduce(
          (acc, n) => acc + (graph.get(n)?.size ?? 0),
          0
        );
        // romper empates con leve aleatorio
        return degB - degA + Math.sign(Math.random() - 0.5);
      });

      for (const subj of subjSorted) {
        // ya tengo un NRC de esta materia?
        const have = [...pick].some(
          (n) => secByNrc.get(n)?.subjectCode === subj
        );
        if (have) continue;

        const candidates = subjectsMap.get(subj) ?? [];
        let placed = false;
        for (const nrc of candidates) {
          if (!isCompatibleWith(pick, nrc)) continue;
          pick.add(nrc);
          placed = true;
          break;
        }
        // si ninguno cupo, se salta
      }

      const sc = scoreSelection(pick);
      if (sc < bestScore) {
        bestScore = sc;
        best = pick;
      }
    }
    return { best, score: bestScore };
  }

  /* ---------- aplicar resultado ---------- */
  const applySelection = (target: Set<string>) => {
    // apaga lo que esté encendido y no pertenezca al target
    for (const n of Array.from(selected)) {
      if (!target.has(n)) toggle(n);
    }
    // enciende los que falten
    for (const n of Array.from(target)) {
      if (!selected.has(n)) toggle(n);
    }
  };

  /* ---------- run ---------- */
  const run = (opts?: { overrideRespect?: boolean }) => {
    const respect = opts?.overrideRespect ?? respectSelected;

    const firstTry = buildSchedule(respect);
    if (firstTry.reason && respect) {
      // hay conflicto con seleccionados fijos
      const proceed = confirm(
        `${firstTry.reason}\n\n¿Quieres ignorar los seleccionados actuales y generar de todas formas?`
      );
      if (!proceed) return;
      const second = buildSchedule(false);
      applySelection(second.best);
      setLastSummary(
        `Activados: ${second.best.size} NRC · Puntuación=${second.score}`
      );
      setOpen(false);
      return;
    }

    applySelection(firstTry.best);
    setLastSummary(
      `Activados: ${firstTry.best.size} NRC · Puntuación=${firstTry.score}`
    );
    setOpen(false);
  };

  /* ================= UI ================= */
  return (
    <>
      {asButton && (
        <button className={buttonClassName} onClick={() => setOpen(true)}>
          ✨ Generar horario
        </button>
      )}

      <div className={`modal ${open ? "modal--open" : ""}`} aria-hidden={!open}>
        <div className="modal__backdrop" onClick={() => setOpen(false)} />
        <div className="modal__panel">
          <div className="modal__head">
            <div className="modal__title">Generar horario</div>
            <button
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="modal__body space-y-3">
            <div className="card">
              <div className="label">Turno preferido</div>
              <select
                className="select"
                value={prefShift}
                onChange={(e) => setPrefShift(e.target.value as PrefShift)}
              >
                <option value="any">Indiferente</option>
                <option value="morning">Mañana (6:00–12:00)</option>
                <option value="afternoon">Tarde (12:00–18:00)</option>
                <option value="evening">Noche (18:00–22:30)</option>
              </select>
            </div>

            <div className="card">
              <div className="label">Hueco máximo por día</div>
              <select
                className="select"
                value={String(maxGap)}
                onChange={(e) => {
                  const v = e.target.value;
                  setMaxGap(v === "Infinity" ? Infinity : Number(v));
                }}
              >
                <option value={0}>Sin huecos</option>
                <option value={60}>Hasta 1 hora</option>
                <option value={120}>Hasta 2 horas</option>
                <option value={180}>Hasta 3 horas</option>
                <option value={"Infinity"}>No importa</option>
              </select>
            </div>

            <div className="card">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={compactDays}
                  onChange={(e) => setCompactDays(e.target.checked)}
                />
                <span>Preferir días compactos</span>
              </label>
            </div>

            <div className="card">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={respectSelected}
                  onChange={(e) => setRespectSelected(e.target.checked)}
                />
                <span>Respetar los NRC ya seleccionados</span>
              </label>
              <p className="note mt-1">
                Si los seleccionados chocan entre sí, te preguntaremos si
                quieres ignorarlos para poder generar.
              </p>
            </div>

            {lastSummary && (
              <p className="note">Último resultado: {lastSummary}</p>
            )}

            <div className="form-actions">
              <button className="btn btn-green btn-full" onClick={() => run()}>
                Generar
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
