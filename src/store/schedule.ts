import { create } from "zustand";
import { toMin } from "@/lib/time";

/* =========================
   Tipos del dominio
========================= */
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

export type Day = "LUN" | "MAR" | "MIE" | "JUE" | "VIE" | "SAB" | "DOM";

export type Meeting = {
  nrc: string;
  day: Day;
  start: string | number | Date;
  end: string | number | Date;
};

type Graph = Map<string, Set<string>>;

type DataPayload = {
  subjects: Subject[];
  professors: Professor[];
  sections: Section[];
  meetings: Meeting[];
};

type Metrics = {
  V: number; // número de vértices
  E: number; // número de aristas (contadas una sola vez)
  maxDegree: number; // grado máximo
  density: number; // E / (V*(V-1)/2)
};

type ScheduleState = {
  subjects: Subject[];
  professors: Professor[];
  sections: Section[];
  meetings: Meeting[];

  // índices útiles
  sectionByNrc: Map<string, Section>;
  meetingsByNrc: Map<string, Meeting[]>;

  // selección y conflictos
  selected: Set<string>;
  conflicts: Set<string>;

  // grafo de incompatibilidades
  graph: Graph;
  metrics: Metrics;

  setData: (p: DataPayload) => void;
  rebuildGraph: () => void; // por si cambian datos
  toggle: (nrc: string) => void;

  // resumen para la vista /graph
  graphSummary: () => Metrics;
};

/* =========================
   Helpers
========================= */

// orden semanal para ordenar/imprimir
const dayOrder: Record<Day, number> = {
  LUN: 1,
  MAR: 2,
  MIE: 3,
  JUE: 4,
  VIE: 5,
  SAB: 6,
  DOM: 7,
};

// ¿dos bloques se solapan? (mismo día + intersección abierta)
function overlap(
  a: { day: Day; start: string | number | Date; end: string | number | Date },
  b: { day: Day; start: string | number | Date; end: string | number | Date }
) {
  if (a.day !== b.day) return false;
  const sa = toMin(a.start),
    ea = toMin(a.end);
  const sb = toMin(b.start),
    eb = toMin(b.end);
  // semiabierto a derecha: [start, end)
  return sa < eb && sb < ea;
}

// agrupa meetings por NRC
function buildMeetingsByNrc(meetings: Meeting[]) {
  const map = new Map<string, Meeting[]>();
  for (const m of meetings) {
    if (!map.has(m.nrc)) map.set(m.nrc, []);
    map.get(m.nrc)!.push(m);
  }
  return map;
}

// índice rápido sectionByNrc
function buildSectionByNrc(sections: Section[]) {
  return new Map<string, Section>(sections.map((s) => [s.nrc, s]));
}

// añade arista no dirigida
function addEdge(g: Graph, a: string, b: string) {
  if (a === b) return;
  if (!g.has(a)) g.set(a, new Set());
  if (!g.has(b)) g.set(b, new Set());
  g.get(a)!.add(b);
  g.get(b)!.add(a);
}

// Conflictos = unión de vecinos de todos los seleccionados (excluyendo los propios seleccionados)
function buildConflicts(selected: Set<string>, graph: Graph) {
  const res = new Set<string>();
  for (const nrc of selected) {
    const neigh = graph.get(nrc);
    if (!neigh) continue;
    for (const v of neigh) res.add(v);
  }
  for (const n of selected) res.delete(n);
  return res;
}

/* =========================
   Construcción del grafo
========================= */
/**
 * Estrategia:
 * 1) Conectar cliques por misma materia (subjectCode).
 * 2) Detectar choques por día usando sweep line:
 *    - Para cada día, ordenar meetings por inicio.
 *    - Mantener ventana activa por hora de fin, conectar si hay solape.
 */
function buildGraphEfficient(sections: Section[], meetings: Meeting[]): Graph {
  const g: Graph = new Map();
  // inicializar vértices
  for (const s of sections) g.set(s.nrc, new Set());

  // 1) Misma materia (cliques)
  const bySubject = new Map<string, string[]>(); // subjectCode -> nrc[]
  for (const s of sections) {
    if (!bySubject.has(s.subjectCode)) bySubject.set(s.subjectCode, []);
    bySubject.get(s.subjectCode)!.push(s.nrc);
  }
  for (const [, list] of bySubject) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) addEdge(g, list[i], list[j]);
    }
  }

  // 2) Choques de horario por día (sweep line)
  const days: Day[] = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];
  for (const d of days) {
    const M = meetings
      .filter((m) => m.day === d)
      .map((m) => ({
        nrc: m.nrc,
        s: toMin(m.start),
        e: toMin(m.end),
      }))
      .sort((a, b) => a.s - b.s);

    // ventana activa ordenada por hora de fin
    const active: { nrc: string; s: number; e: number }[] = [];

    for (const m of M) {
      // purgar los que ya terminaron
      while (active.length && active[0].e <= m.s) active.shift();

      // conectar con todos los que aún están activos (si hay solape)
      for (const a of active) {
        if (a.s < m.e && m.s < a.e) addEdge(g, a.nrc, m.nrc);
      }

      // insertar m manteniendo orden por e (fin)
      let k = active.length;
      while (k > 0 && active[k - 1].e > m.e) k--;
      active.splice(k, 0, m);
    }
  }

  return g;
}

/* =========================
   Métricas del grafo
========================= */
function computeMetrics(graph: Graph): Metrics {
  const V = graph.size;
  let sumDegrees = 0;
  let maxDegree = 0;

  for (const [, adj] of graph) {
    const d = adj.size;
    sumDegrees += d;
    if (d > maxDegree) maxDegree = d;
  }

  const E = sumDegrees / 2; // no dirigido
  const density = V > 1 ? E / ((V * (V - 1)) / 2) : 0;

  return { V, E, maxDegree, density };
}

/* =========================
   Store Zustand
========================= */
export const useSchedule = create<ScheduleState>((set, get) => ({
  subjects: [],
  professors: [],
  sections: [],
  meetings: [],

  sectionByNrc: new Map(),
  meetingsByNrc: new Map(),

  selected: new Set(),
  conflicts: new Set(),

  graph: new Map(),
  metrics: { V: 0, E: 0, maxDegree: 0, density: 0 },

  setData: ({ subjects, professors, sections, meetings }) => {
    // índices
    const sectionByNrc = buildSectionByNrc(sections);
    const meetingsByNrc = buildMeetingsByNrc(meetings);

    // grafo + métricas
    const graph = buildGraphEfficient(sections, meetings);
    const selected = new Set<string>(); // calendario inicia vacío
    const conflicts = buildConflicts(selected, graph);
    const metrics = computeMetrics(graph);

    set({
      subjects,
      professors,
      sections,
      meetings,
      sectionByNrc,
      meetingsByNrc,
      graph,
      metrics,
      selected,
      conflicts,
    });
  },

  rebuildGraph: () => {
    const { sections, meetings, selected } = get();
    const graph = buildGraphEfficient(sections, meetings);
    const conflicts = buildConflicts(selected, graph);
    const metrics = computeMetrics(graph);
    set({ graph, metrics, conflicts });
  },

  toggle: (nrc: string) => {
    const { selected, graph } = get();
    const next = new Set(selected);

    if (next.has(nrc)) next.delete(nrc);
    else next.add(nrc);

    const conflicts = buildConflicts(next, graph);
    set({ selected: next, conflicts });
  },

  graphSummary: () => get().metrics,
}));
