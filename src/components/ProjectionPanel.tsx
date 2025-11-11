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
    // Puede ser fracción del día (0..1) o 830
    if (x < 1) {
      const total = Math.round(x * 24 * 60);
      const h = String(Math.floor(total / 60)).padStart(2, "0");
      const m = String(total % 60).padStart(2, "0");
      return `${h}:${m}`;
    } else {
      const h = String(Math.floor(x / 100)).padStart(2, "0");
      const m = String(x % 100).padStart(2, "0");
      return `${h}:${m}`;
    }
  }
  const s = String(x);
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
  const { subjects, sections, meetings, professors, toggle } = useSchedule();

  // utilidades
  const profById = useMemo(
    () => new Map(professors.map((p) => [p.professorId, p.professorName])),
    [professors]
  );

  // Preagrupamos meetings por NRC y ya dejamos start/end formateados
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

  const sectionsBySubject = useMemo(() => {
    const map = new Map<string, { nrc: string; professorId: string }[]>();
    for (const s of sections) {
      const arr = map.get(s.subjectCode) ?? [];
      arr.push({ nrc: s.nrc, professorId: s.professorId });
      map.set(s.subjectCode, arr);
    }
    return map;
  }, [sections]);

  function selectNrc(nrc: string) {
    toggle(nrc);
    // onClose(); // si quieres cerrar al elegir, descomenta
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
                  return (
                    <div key={nrc} className="item">
                      <div>
                        <div className="item__title">Prof. {prof}</div>
                        <div className="item__meta">
                          NRC {nrc} · {meets || "horario por definir"}
                        </div>
                      </div>
                      <button
                        className="btn btn-green"
                        onClick={() => selectNrc(nrc)}
                      >
                        Agregar
                      </button>
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
