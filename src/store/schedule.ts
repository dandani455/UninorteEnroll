import { create } from "zustand";
import { toMin, overlap } from "@/lib/time";

export type Meeting = { nrc: string; day: string; start: string | number | Date; end: string | number | Date };
export type Section = { nrc: string; subjectCode: string; professorId: string };
/** ← aquí añadimos semester y credits (opcionales por si algún JSON no los trae) */
export type Subject = { subjectCode: string; subjectName: string; semester?: number; credits?: number };
export type Professor = { professorId: string; professorName: string };

// Qué puede recibir setData (solo las colecciones que cargamos)
type SetData = {
  subjects?: Subject[];
  professors?: Professor[];
  sections?: Section[];
  meetings?: Meeting[];
};

type State = {
  subjects: Subject[];
  professors: Professor[];
  sections: Section[];
  meetings: Meeting[];
  selected: Set<string>;   // NRCs elegidos
  conflicts: Set<string>;  // NRCs que chocan con la selección
  setData: (d: SetData) => void;
  toggle: (nrc: string) => void;
};

function buildConflicts(
  selected: Set<string>,
  sections: Section[],
  meetings: Meeting[]
): Set<string> {
  const byNrc = new Map<string, { day: string; start: number; end: number }[]>();
  for (const m of meetings) {
    const arr = byNrc.get(m.nrc) ?? [];
    arr.push({ day: m.day, start: toMin(m.start), end: toMin(m.end) });
    byNrc.set(m.nrc, arr);
  }

  const secByNrc = new Map(sections.map((s) => [s.nrc, s]));
  const conflicts = new Set<string>();
  const selectedArr = [...selected];

  for (const nrc of secByNrc.keys()) {
    for (const sNrc of selectedArr) {
      if (nrc === sNrc) continue;

      // 1) Solape temporal en algún día
      const A = byNrc.get(nrc) || [];
      const B = byNrc.get(sNrc) || [];
      let clash = false;
      for (const a of A) {
        for (const b of B) {
          if (a.day === b.day && overlap(a, b)) {
            clash = true;
            break;
          }
        }
        if (clash) break;
      }
      if (clash) {
        conflicts.add(nrc);
        continue;
      }

      // 2) Misma materia y mismo profesor
      const sa = secByNrc.get(nrc)!;
      const sb = secByNrc.get(sNrc)!;
      if (sa.subjectCode === sb.subjectCode && sa.professorId === sb.professorId) {
        conflicts.add(nrc);
      }
    }
  }

  // no marcar como conflicto lo que ya está seleccionado
  for (const n of selectedArr) conflicts.delete(n);
  return conflicts;
}

export const useSchedule = create<State>((set, get) => ({
  subjects: [],
  professors: [],
  sections: [],
  meetings: [],
  selected: new Set<string>(),
  conflicts: new Set<string>(),

  // sin 'any': mergeamos con el estado actual
  setData: (d) => set((prev) => ({ ...prev, ...d })),

  toggle: (nrc: string) => {
    const sel = new Set(get().selected);
    sel.has(nrc) ? sel.delete(nrc) : sel.add(nrc);

    const conflicts = buildConflicts(sel, get().sections, get().meetings);
    set({ selected: sel, conflicts });
  },
}));
