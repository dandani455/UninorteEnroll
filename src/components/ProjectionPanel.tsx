"use client";

import { useMemo } from "react";
import { useSchedule } from "@/store/schedule";

type Props = { open: boolean; onClose: () => void; title?: string };

/** Formatea horas que pueden venir como string | number | Date */
function fmt(x: string | number | Date) {
  if (x instanceof Date) {
    return x.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (typeof x === "number") {
    // Puede ser fracción del día (0..1) o HHMM (830 -> 08:30)
    if (x >= 0 && x < 1) {
      const total = Math.round(x * 24 * 60);
      const h = String(Math.floor(total / 60)).padStart(2, "0");
      const m = String(total % 60).padStart(2, "0");
      return `${h}:${m}`;
    }
    const h = String(Math.floor(x / 100)).padStart(2, "0");
    const m = String(x % 100).padStart(2, "0");
    return `${h}:${m}`;
  }
  const s = String(x || "");
  if (s.includes(":")) return s;
  const n = Number(s);
  const h = String(Math.floor(n / 100)).padStart(2, "0");
  const m = String(n % 100).padStart(2, "0");
  return `${h}:${m}`;
}

export default function ProjectionPanel({
  open,
  onClose,
  title = "Mi proyección — 202610",
}: Props) {
  const {
    subjects,
    sections,
    meetings,
    professors,
    selected,
    conflicts,
    toggle,
    graph, // Map<string, Set<string>>
  } = useSchedule();

  // mapas auxiliares
  const profById = useMemo(
    () => new Map(professors.map((p) => [p.professorId, p.professorName])),
    [professors]
  );
  const secByNrc = useMemo(
    () => new Map(sections.map((s) => [s.nrc, s])),
    [sections]
  );
  const subjByCode = useMemo(
    () => new Map(subjects.map((s) => [s.subjectCode, s])),
    [subjects]
  );

  // meetings por NRC con horas formateadas
  const meetingsByNrc = useMemo(() => {
    const map = new Map<
      string,
      { day: string; start: string; end: string }[]
    >();
    for (const m of meetings) {
      const arr = map.get(m.nrc) ?? [];
      arr.push({ day: m.day, start: fmt(m.start), end: fmt(m.end) });
      map.set(m.nrc, arr);
    }
    return map;
  }, [meetings]);

  // secciones por materia
  const sectionsBySubject = useMemo(() => {
    const map = new Map<string, { nrc: string; professorId: string }[]>();
    for (const s of sections) {
      const arr = map.get(s.subjectCode) ?? [];
      arr.push({ nrc: s.nrc, professorId: s.professorId });
      map.set(s.subjectCode, arr);
    }
    return map;
  }, [sections]);

  // --- Corrige posición del tooltip para que no se salga de la pantalla ---
  function fixTooltipWithinViewport(wrapper: HTMLDivElement) {
    const tip = wrapper.querySelector<HTMLDivElement>(".tooltip");
    if (!tip) return;

    // reset y medición
    tip.style.setProperty("--tip-shift", "0px");
    const rect = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const margin = 12;

    let shift = 0;
    if (rect.left < margin) shift += margin - rect.left;
    if (rect.right > vw - margin) shift -= rect.right - (vw - margin);

    tip.style.setProperty("--tip-shift", `${Math.round(shift)}px`);
  }

  return (
    <div className={`modal ${open ? "modal--open" : ""}`}>
      <div className="modal__backdrop" onClick={onClose} />
      <aside className="modal__panel">
        <div className="modal__head">
          <div className="modal__title">{title}</div>
          <button className="btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal__body">
          {subjects.map((subj) => {
            const secs = sectionsBySubject.get(subj.subjectCode) ?? [];
            return (
              <div key={subj.subjectCode} className="card">
                <div className="item">
                  <div>
                    <div className="item__title">
                      {subj.subjectCode} — {subj.subjectName}
                    </div>
                    <div className="item__meta">
                      Créditos: {subj.credits ?? "—"} · Opciones:{" "}
                      {secs.length || 0}
                    </div>
                  </div>
                  <span className="badge">{subj.semester}° semestre</span>
                </div>

                {secs.map(({ nrc, professorId }) => {
                  const meets = (meetingsByNrc.get(nrc) ?? [])
                    .map((m) => `${m.day} ${m.start}–${m.end}`)
                    .join(" · ");
                  const prof = profById.get(professorId) ?? professorId;

                  const isSelected = selected.has(nrc);
                  const isDisabled = conflicts.has(nrc) && !isSelected;

                  // ---- razón de bloqueo (primer conflicto encontrado) ----
                  let reasonText = "";
                  if (isDisabled) {
                    const neighbors = graph.get(nrc) as Set<string> | undefined;
                    const blockers: string[] = neighbors
                      ? [...neighbors].filter((x: string) => selected.has(x))
                      : [];

                    if (blockers.length) {
                      const blocker = blockers[0];
                      const secA = secByNrc.get(nrc);
                      const secB = secByNrc.get(blocker);
                      const subjA = secA
                        ? subjByCode.get(secA.subjectCode)
                        : undefined;
                      const subjB = secB
                        ? subjByCode.get(secB.subjectCode)
                        : undefined;

                      if (
                        secA &&
                        secB &&
                        secA.subjectCode === secB.subjectCode
                      ) {
                        // misma materia
                        reasonText = `Ya tienes activa otra sección de ${
                          subjA?.subjectName ?? secA.subjectCode
                        } (NRC ${blocker})`;
                      } else {
                        // choque horario (resumen de la otra sección)
                        const bm = (meetingsByNrc.get(blocker) ?? [])
                          .map((m) => `${m.day} ${m.start}–${m.end}`)
                          .join(" · ");
                        reasonText = `Choque con ${
                          subjB?.subjectName ??
                          secB?.subjectCode ??
                          "otra materia"
                        } — NRC ${blocker}${bm ? ` — ${bm}` : ""}`;
                      }
                    }
                  }

                  return (
                    <div
                      key={nrc}
                      className={`item ${isDisabled ? "item--blocked" : ""}`}
                    >
                      <div className="item__content">
                        <div className="item__title">Prof. {prof}</div>
                        <div className="item__meta">
                          NRC {nrc} · {meets || "horario por definir"}
                        </div>
                      </div>

                      {/* Wrapper del switch + tooltip con corrección de overflow */}
                      <div
                        className="switch-wrapper"
                        onMouseEnter={(e) =>
                          fixTooltipWithinViewport(
                            e.currentTarget as HTMLDivElement
                          )
                        }
                        onFocus={(e) =>
                          fixTooltipWithinViewport(
                            e.currentTarget as HTMLDivElement
                          )
                        }
                      >
                        <button
                          type="button"
                          className={`switch ${isSelected ? "is-on" : ""} ${
                            isDisabled ? "is-disabled" : ""
                          }`}
                          aria-pressed={isSelected}
                          disabled={isDisabled}
                          onClick={() => toggle(nrc)}
                          title={
                            isDisabled
                              ? reasonText || "Conflicto con tu selección"
                              : undefined
                          }
                        >
                          <span className="switch__label">
                            {isSelected ? "Activado" : "Activar"}
                          </span>
                          <span className="switch__knob" />
                        </button>

                        {isDisabled && reasonText && (
                          <div className="tooltip">{reasonText}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
