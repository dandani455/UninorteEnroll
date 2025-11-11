"use client";

import { useMemo } from "react";
import { useSchedule } from "@/store/schedule";
import { DAYS, toMin } from "@/lib/time";

const DAY_LABELS: Record<string, string> = {
  LUN: "Lunes",
  MAR: "Martes",
  MIE: "Miércoles",
  JUE: "Jueves",
  VIE: "Viernes",
  SAB: "Sábado",
  DOM: "Domingo",
};

// rejilla de 06:30 a 20:30 en pasos de 30 min
const GRID_START = toMin("06:30");
const GRID_END = toMin("20:30");
const SLOT = 30; // min

export default function WeekCalendar() {
  const { meetings, sections, subjects, selected, conflicts, toggle } =
    useSchedule();

  const secByNrc = useMemo(
    () => new Map(sections.map((s) => [s.nrc, s])),
    [sections]
  );
  const subjByCode = useMemo(
    () => new Map(subjects.map((s) => [s.subjectCode, s])),
    [subjects]
  );

  function fmt(x: string | number | Date) {
    return x instanceof Date
      ? x.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
      : String(x);
  }

  // para layout absoluto dentro del día
  // acepta string | number | Date porque toMin ya soporta el union
  function blockStyle(
    startHHMM: string | number | Date,
    endHHMM: string | number | Date
  ) {
    const top = ((toMin(startHHMM) - GRID_START) / SLOT) * 1.5; // 1.5rem por slot
    const height = ((toMin(endHHMM) - toMin(startHHMM)) / SLOT) * 1.5;
    return { top: `${top}rem`, height: `${height}rem` };
  }

  return (
    <div className="w-full grid grid-cols-[100px_repeat(7,1fr)] gap-x-2">
      {/* encabezados */}
      <div />
      {DAYS.map((d) => (
        <div key={d} className="text-center font-semibold py-2">
          {DAY_LABELS[d]}
        </div>
      ))}

      {/* columna horas */}
      <div className="hours-col relative">
        {/* <- antes: 'relative' */}
        {Array.from(
          { length: (GRID_END - GRID_START) / SLOT + 1 },
          (_, i) => GRID_START + i * SLOT
        ).map((min) => {
          const hh = String(Math.floor(min / 60)).padStart(2, "0");
          const mm = String(min % 60).padStart(2, "0");
          return (
            <div key={min}>
              {hh}:{mm}
            </div>
          );
          {
            /* <- removí clases inline duplicadas */
          }
        })}
      </div>

      {/* celdas por día */}
      {DAYS.map((day) => (
        <div
          key={day}
          className="relative timetable-day timetable-stripes" /* <- antes: 'relative border-l' */
        >
          {/* líneas de media hora */}
          {Array.from({ length: (GRID_END - GRID_START) / SLOT }, (_, i) => (
            <div
              key={i}
              className="halfhour-line"
            /> /* <- antes: h-6 border ... */
          ))}

          {/* bloques */}
          {meetings
            .filter((m) => m.day === day)
            .map((m, idx) => {
              const s = secByNrc.get(m.nrc)!;
              const subj =
                subjByCode.get(s.subjectCode)?.subjectName ?? s.subjectCode;
              const isSelected = selected.has(m.nrc);
              const isConflict = conflicts.has(m.nrc);
              return (
                <button
                  key={m.nrc + idx}
                  onClick={() => toggle(m.nrc)}
                  className={`block ${
                    isSelected
                      ? "block--selected"
                      : isConflict
                      ? "block--conflict"
                      : "block--ok"
                  }`}
                  /* <- antes: clases largas; ahora usamos utilidades .block* */
                  style={blockStyle(m.start, m.end)}
                  title={
                    isConflict
                      ? `No posible: conflicto con tu selección`
                      : `NRC ${m.nrc} · ${subj}\n${fmt(m.start)} - ${fmt(
                          m.end
                        )}`
                  }
                >
                  <div className="font-semibold">{subj}</div>
                  <div className="opacity-80">
                    NRC {m.nrc} · {fmt(m.start)}–{fmt(m.end)}
                  </div>
                </button>
              );
            })}
        </div>
      ))}
    </div>
  );
}
