import { create } from "zustand";
import { toMin } from "@/lib/time";

/* ===== Tipos ===== */
export type Subject = {
  subjectCode: string;
  subjectName: string;
  semester?: number;
  credits?: number;
};

export type Professor = {
  professorId: string;
  professorName: string;
};

export type Section = {
  nrc: string;
  subjectCode: string;
  professorId: string;
};

export type Meeting = {
  nrc: string;
  day: "LUN" | "MAR" | "MIE" | "JUE" | "VIE" | "SAB" | "DOM";
  start: string | number | Date;
  end: string | number | Date;
};

type Graph = Map<string, Set<string>>; // adjacencias NRC -> {NRC,...}

type DataPayload = {
  subjects: Subject[];
  professors: Professor[];
  sections: Section[];
  meetings: Meeting[];
};

type ScheduleState = {
  subjects: Subject[];
  professors: Professor[];
  sections: Section[];
  meetings: Meeting[];

  // selección actual y conflictos
  selected: Set<string>;
  conflicts: Set<string>;

  // grafo de incompatibilidades (aristas = no pueden ir juntos)
  graph: Graph;

  setData: (p: DataPayload) => void;
  toggle: (nrc: string) => void;

  // util: resumen para panel de "ver grafo"
  graphSummary: () => { V: number; E: number };
};

/* ===== Helpers ===== */

// ¿dos bloques se solapan? (mismo día + intervalo cruza)
function overlap(
  a: {
    day: string;
    start: string | number | Date;
    end: string | number | Date;
  },
  b: { day: string; start: string | number | Date; end: string | number | Date }
) {
  if (a.day !== b.day) return false;
  const sa = toMin(a.start),
    ea = toMin(a.end);
  const sb = toMin(b.start),
    eb = toMin(b.end);
  return sa < eb && sb < ea; // intersección abierta
}

// arma mapa: NRC -> meetings[]
function meetingsByNrc(meetings: Meeting[]) {
  const map = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const arr = map.get(m.nrc) ?? [];
    arr.push(m);
    map.set(m.nrc, arr);
  }
  return map;
}

// crea grafo: vértices=NRC; arista si (A) misma materia ó (B) choque horario
function buildGraph(sections: Section[], meetings: Meeting[]): Graph {
  const adj: Graph = new Map();
  const secByNrc = new Map(sections.map((s) => [s.nrc, s]));
  const meetByNrc = meetingsByNrc(meetings);

  // inicializa vértices
  for (const s of sections) adj.set(s.nrc, new Set());

  const nrcs = sections.map((s) => s.nrc);

  for (let i = 0; i < nrcs.length; i++) {
    for (let j = i + 1; j < nrcs.length; j++) {
      const a = nrcs[i],
        b = nrcs[j];

      const sa = secByNrc.get(a)!;
      const sb = secByNrc.get(b)!;

      const sameSubject = sa.subjectCode === sb.subjectCode;

      let timeConflict = false;
      const ma = meetByNrc.get(a) ?? [];
      const mb = meetByNrc.get(b) ?? [];
      // si alguna reunión se solapa el mismo día => conflicto
      outer: for (const ra of ma) {
        for (const rb of mb) {
          if (overlap(ra, rb)) {
            timeConflict = true;
            break outer;
          }
        }
      }

      if (sameSubject || timeConflict) {
        adj.get(a)!.add(b);
        adj.get(b)!.add(a);
      }
    }
  }

  return adj;
}

// Conflictos = vecinos de cualquier seleccionado
function buildConflicts(selected: Set<string>, graph: Graph) {
  const res = new Set<string>();
  for (const nrc of selected) {
    const neigh = graph.get(nrc);
    if (!neigh) continue;
    for (const v of neigh) res.add(v);
  }
  // no marcamos como conflicto a los propios seleccionados
  for (const n of selected) res.delete(n);
  return res;
}

/* ===== Store ===== */
export const useSchedule = create<ScheduleState>((set, get) => ({
  subjects: [],
  professors: [],
  sections: [],
  meetings: [],

  selected: new Set(),
  conflicts: new Set(),
  graph: new Map(),

  setData: ({ subjects, professors, sections, meetings }) => {
    const graph = buildGraph(sections, meetings);
    const selected = new Set<string>(); // arranca vacío para que el calendario esté vacío
    const conflicts = buildConflicts(selected, graph);
    set({
      subjects,
      professors,
      sections,
      meetings,
      graph,
      selected,
      conflicts,
    });
  },

  toggle: (nrc: string) => {
    const { selected, graph } = get();
    const next = new Set(selected);

    if (next.has(nrc)) next.delete(nrc);
    else next.add(nrc);

    const conflicts = buildConflicts(next, graph);
    set({ selected: next, conflicts });
  },

  graphSummary: () => {
    const { graph } = get();
    let edges = 0;
    for (const [, s] of graph) edges += s.size;
    // cada arista contada dos veces en adjacencia
    return { V: graph.size, E: Math.floor(edges / 2) };
  },
}));
