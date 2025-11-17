"use client";

import { useMemo, useState } from "react";
import { useSchedule } from "@/store/schedule";

/* ===== Helpers ===== */
type TMoment = string | number | Date;
const toMin = (x: TMoment): number => {
  if (typeof x === "number") return x;
  if (x instanceof Date) return x.getHours() * 60 + x.getMinutes();
  const [h, m] = String(x).split(":").map(Number);
  return h * 60 + (m || 0);
};

/* ===== Componente ===== */
export default function GenerateSchedule() {
  const { sections, meetings, graph, selected, toggle } = useSchedule();

  // Estado para abrir/cerrar menú
  const [open, setOpen] = useState(false);

  // Materias agrupadas
  const subjects = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of sections) {
      const arr = map.get(s.subjectCode) ?? [];
      arr.push(s.nrc);
      map.set(s.subjectCode, arr);
    }
    return map;
  }, [sections]);

  // Nombres de materias
  const subjectNames = useMemo(() => {
    const subjName = new Map<string, string>();
    const subjList = useSchedule.getState().subjects as {
      subjectCode: string;
      subjectName: string;
    }[];
    for (const subj of subjList)
      subjName.set(subj.subjectCode, subj.subjectName);
    return subjName;
  }, []);

  // Meetings por NRC
  const meetsByNrc = useMemo(() => {
    const map = new Map<
      string,
      { day: string; start: number; end: number }[]
    >();
    for (const m of meetings) {
      const arr = map.get(m.nrc) ?? [];
      arr.push({ day: m.day, start: toMin(m.start), end: toMin(m.end) });
      map.set(m.nrc, arr);
    }
    return map;
  }, [meetings]);

  // Materias seleccionadas
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(
    new Set()
  );
  const toggleSubject = (code: string) => {
    const newSet = new Set(selectedSubjects);
    newSet.has(code) ? newSet.delete(code) : newSet.add(code);
    setSelectedSubjects(newSet);
  };

  // Verifica compatibilidad usando el grafo
  const isCompatibleWith = (pick: Set<string>, candidate: string) => {
    const neighbors = graph.get(candidate);
    if (!neighbors) return true;
    for (const u of pick) if (neighbors.has(u)) return false;
    return true;
  };

  // Generador de horario aleatorio sin choques
  const buildSchedule = (): Set<string> => {
    const pick = new Set<string>();
    const chosen = [...selectedSubjects];
    if (chosen.length === 0) return pick;
    const shuffled = chosen.sort(() => Math.random() - 0.5);
    for (const subj of shuffled) {
      const options = subjects.get(subj) ?? [];
      const shuffledOpt = options.sort(() => Math.random() - 0.5);
      for (const nrc of shuffledOpt) {
        if (isCompatibleWith(pick, nrc)) {
          pick.add(nrc);
          break;
        }
      }
    }
    return pick;
  };

  // Aplica al store (toggle)
  const applySelection = (target: Set<string>) => {
    for (const n of Array.from(selected)) if (!target.has(n)) toggle(n);
    for (const n of Array.from(target)) if (!selected.has(n)) toggle(n);
  };

  // Ejecuta generación
  const handleGenerate = () => {
    if (selectedSubjects.size === 0) {
      alert("Selecciona al menos una materia.");
      return;
    }
    const best = buildSchedule();
    if (best.size === 0) {
      alert("⚠️ No se pudo generar un horario válido.");
      return;
    }
    applySelection(best);
    setOpen(false);
    alert(`✅ Horario generado (${best.size} NRC seleccionados).`);
  };

  /* ===== Render ===== */
  return (
    <>
      {/* Botón principal */}
      <button className="btn-green" onClick={() => setOpen(true)}>
        ✨ Generar horario
      </button>

      {/* Modal flotante */}
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Selecciona materias</h3>
              <button className="btn-close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 mb-4">
              {[...subjects.keys()].map((code) => (
                <label key={code} className="subject-option">
                  <input
                    type="checkbox"
                    checked={selectedSubjects.has(code)}
                    onChange={() => toggleSubject(code)}
                  />
                  <span>
                    {subjectNames.get(code) || code}
                    <span className="text-slate-500 text-sm ml-1">
                      ({code})
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <button className="btn-modal" onClick={handleGenerate}>
              Generar horario
            </button>
          </div>
        </div>
      )}
    </>
  );
}
