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

  // índices de lookup
  const secByNrc = useMemo(
    () => new Map(sections.map((s) => [s.nrc, s])),
    [sections]
  );
  const subjByCode = useMemo(
    () => new Map(subjects.map((s) => [s.subjectCode, s])),
    [subjects]
  );

  /** Formatea horas que podrían venir como string | number | Date */
  function fmt(x: string | number | Date) {
    if (x instanceof Date) {
      return x.toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return String(x ?? "");
  }

  /** Layout absoluto dentro del día. Acepta string | number | Date porque toMin lo soporta. */
  function blockStyle(
    startHHMM: string | number | Date,
    endHHMM: string | number | Date
  ) {
    const top = ((toMin(startHHMM) - GRID_START) / SLOT) * 1.5; // 1.5rem por slot (30 min)
    const height = ((toMin(endHHMM) - toMin(startHHMM)) / SLOT) * 1.5;
    return { top: `${top}rem`, height: `${height}rem` };
  }

  // 👉 solo mostrar reuniones de NRC activados
  const visibleMeetings = useMemo(
    () => meetings.filter((m) => selected.has(m.nrc)),
    [meetings, selected]
  );

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
        })}
      </div>

      {/* celdas por día */}
      {DAYS.map((day) => (
        <div key={day} className="relative timetable-day timetable-stripes">
          {/* líneas de media hora */}
          {Array.from({ length: (GRID_END - GRID_START) / SLOT }, (_, i) => (
            <div key={i} className="halfhour-line" />
          ))}

          {/* bloques solo de seleccionados */}
          {visibleMeetings
            .filter((m) => m.day === day)
            .map((m, idx) => {
              const sec = secByNrc.get(m.nrc);
              const subjName = sec
                ? subjByCode.get(sec.subjectCode)?.subjectName ??
                  sec.subjectCode
                : m.nrc;

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
                  style={blockStyle(m.start, m.end)}
                  title={
                    isConflict
                      ? "No posible: conflicto con tu selección"
                      : `NRC ${m.nrc} · ${subjName}\n${fmt(m.start)} - ${fmt(
                          m.end
                        )}`
                  }
                >
                  <div className="font-semibold">{subjName}</div>
                  <div className="opacity-80">
                    NRC {m.nrc} · {fmt(m.start)}–{fmt(m.end)}
                  </div>
                </button>
              );
            })}
        </div>
      ))}

      {/* mensaje de vacío */}
      {visibleMeetings.length === 0 && (
        <div className="col-span-8 py-8 text-center text-sm text-gray-500">
          No has seleccionado materias. Abre <b>“Mi proyección”</b> y activa
          algunas secciones.
        </div>
      )}
    </div>
  );
}
