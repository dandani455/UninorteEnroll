"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSchedule } from "@/store/schedule";
import GraphCard from "@/components/GraphCard";

/* =========================================================
   Helpers (tipados) 
   ========================================================= */

type TMoment = string | number | Date;

const toMin = (x: TMoment): number => {
  if (typeof x === "number") return x;
  if (x instanceof Date) return x.getHours() * 60 + x.getMinutes();
  const [h, m] = String(x).split(":").map(Number);
  return h * 60 + (m || 0);
};

const fmtHm = (x: TMoment): string => {
  const m = toMin(x);
  const hh = Math.floor(m / 60)
    .toString()
    .padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
};

const overlap = (
  a: { day: string; start: TMoment; end: TMoment },
  b: { day: string; start: TMoment; end: TMoment }
): boolean => {
  if (a.day !== b.day) return false;
  const sa = toMin(a.start);
  const ea = toMin(a.end);
  const sb = toMin(b.start);
  const eb = toMin(b.end);
  return sa < eb && sb < ea; // intersección abierta
};

type Row = (string | number | boolean)[];
const toCsv = (rows: Row[]) =>
  rows
    .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");

/* =========================================================
   Página
   ========================================================= */

export default function GraphPage() {
  const { sections, meetings, graph, metrics, sectionByNrc } = useSchedule();

  /* ---------- vértices ordenados por grado ---------- */
  const vertices = useMemo(() => {
    return [...new Set(sections.map((s) => s.nrc))].sort(
      (a, b) => (graph.get(b)?.size ?? 0) - (graph.get(a)?.size ?? 0)
    );
  }, [sections, graph]);

  /* ---------- lista de aristas únicas (u<v) ---------- */
  const edges = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<[string, string]> = [];
    for (const [u, adj] of graph) {
      for (const v of adj) {
        const key = u < v ? `${u}|${v}` : `${v}|${u}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push(u < v ? [u, v] : [v, u]);
        }
      }
    }
    return list.sort();
  }, [graph]);

  /* ---------- coloración greedy (solo demostración) ---------- */
  const coloring = useMemo(() => {
    const order = [...vertices].sort(
      (a, b) => (graph.get(b)?.size ?? 0) - (graph.get(a)?.size ?? 0)
    );
    const color = new Map<string, number>();
    for (const v of order) {
      const forbid = new Set<number>();
      for (const u of graph.get(v) ?? [])
        if (color.has(u)) forbid.add(color.get(u)!);
      let c = 0;
      while (forbid.has(c)) c++;
      color.set(v, c);
    }
    return color;
  }, [vertices, graph]);

  const colorCount = useMemo(() => {
    let max = -1;
    coloring.forEach((c) => (max = Math.max(max, c)));
    return max + 1;
  }, [coloring]);

  /* ---------- meetings indexados por NRC ---------- */
  const meetingsByNrc = useMemo(() => {
    const map = new Map<
      string,
      { day: string; start: TMoment; end: TMoment }[]
    >();
    for (const m of meetings) {
      const arr = map.get(m.nrc) ?? [];
      arr.push({ day: m.day, start: m.start, end: m.end });
      map.set(m.nrc, arr);
    }
    return map;
  }, [meetings]);

  /* ---------- aristas con explicación (tipo + detalle) ---------- */
  type EdgeRow = {
    u: string;
    v: string;
    type: "Misma materia" | "Choque horario";
    detail: string;
  };

  const edgesDetailed: EdgeRow[] = useMemo(() => {
    const out: EdgeRow[] = [];

    for (const [u, v] of edges) {
      const su = sectionByNrc.get(u);
      const sv = sectionByNrc.get(v);

      const sameSubject =
        su?.subjectCode && sv?.subjectCode && su.subjectCode === sv.subjectCode;

      if (sameSubject) {
        out.push({
          u,
          v,
          type: "Misma materia",
          detail: `${su!.subjectCode}`,
        });
        continue;
      }

      // Busca el primer choque horario para explicar
      const mu = meetingsByNrc.get(u) ?? [];
      const mv = meetingsByNrc.get(v) ?? [];
      let detail = "";
      outer: for (const a of mu) {
        for (const b of mv) {
          if (overlap(a, b)) {
            detail = `${a.day} ${fmtHm(a.start)}–${fmtHm(a.end)} ∩ ${fmtHm(
              b.start
            )}–${fmtHm(b.end)}`;
            break outer;
          }
        }
      }

      out.push({
        u,
        v,
        type: "Choque horario",
        detail: detail || "—",
      });
    }

    // ordena: primero choques horarios, luego misma materia, y por (u,v)
    out.sort((A, B) => {
      if (A.type !== B.type) return A.type === "Choque horario" ? -1 : 1;
      if (A.u !== B.u) return A.u.localeCompare(B.u);
      return A.v.localeCompare(B.v);
    });

    return out;
  }, [edges, sectionByNrc, meetingsByNrc]);

  /* ---------- matriz (on demand) ---------- */
  const [showMatrix, setShowMatrix] = useState(false);
  const matrix = useMemo(() => {
    if (!showMatrix) return [] as number[][];
    const idx = new Map(vertices.map((v, i) => [v, i]));
    const N = vertices.length;
    const m = Array.from({ length: N }, () =>
      Array.from({ length: N }, () => 0)
    );
    for (const [u, adj] of graph) {
      const iu = idx.get(u);
      if (iu == null) continue;
      for (const v of adj) {
        const iv = idx.get(v);
        if (iv != null) m[iu][iv] = 1;
      }
    }
    return m;
  }, [showMatrix, vertices, graph]);

  /* ---------- CSVs ---------- */
  const csvEdges = useMemo(() => {
    const rows: Row[] = [["u", "v", "tipo", "detalle"]];
    edgesDetailed.forEach((e) => rows.push([e.u, e.v, e.type, e.detail]));
    return toCsv(rows);
  }, [edgesDetailed]);

  const csvAdj = useMemo(() => {
    if (!showMatrix) return "";
    const header: Row = ["", ...vertices];
    const body: Row[] = matrix.map((row, i) => [vertices[i], ...row]);
    return toCsv([header, ...body]);
  }, [showMatrix, matrix, vertices]);

  /* =========================================================
     Render
     ========================================================= */
  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar__wrap">
          <div className="brand">
            <div className="brand__logo" />
            <div className="brand__title">
              Grafo de NRC{" "}
              <span className="text-sm text-gray-500">
                / análisis y matrices
              </span>
            </div>
          </div>
          <div className="graph-toolbar">
            <a
              download="aristas.csv"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                csvEdges
              )}`}
              className="btn btn-slate"
              title="Descargar aristas CSV"
            >
              ⬇️ Aristas CSV
            </a>

            {showMatrix && (
              <a
                download="adjacency_matrix.csv"
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                  csvAdj
                )}`}
                className="btn btn-slate"
                title="Descargar matriz de adyacencia CSV"
              >
                ⬇️ Matriz CSV
              </a>
            )}

            <Link href="/" className="btn btn-primary">
              ← Volver
            </Link>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <main className="max-w-[1200px] mx-auto px-4 py-6 space-y-8">
        {/* Métricas */}
        <section>
          <div className="metric-grid">
            <div className="card">
              <div className="text-slate-500 text-xs">|V| vértices</div>
              <div className="text-2xl font-semibold">{metrics.V}</div>
            </div>
            <div className="card">
              <div className="text-slate-500 text-xs">|E| aristas</div>
              <div className="text-2xl font-semibold">{metrics.E}</div>
            </div>
            <div className="card">
              <div className="text-slate-500 text-xs">Densidad</div>
              <div className="text-2xl font-semibold">
                {metrics.density.toFixed(3)}
              </div>
            </div>
            <div className="card">
              <div className="text-slate-500 text-xs">Grado máximo</div>
              <div className="text-2xl font-semibold">{metrics.maxDegree}</div>
            </div>
          </div>
          <p className="note">
            <strong>Colores (greedy demo):</strong> {colorCount} grupos
            compatibles.
          </p>
        </section>

        {/* Vértices */}
        <section>
          <h2 className="section-title">Vértices (NRC)</h2>
          <div className="card">
            <div className="flex flex-wrap gap-2">
              {vertices.map((v) => {
                const s = sectionByNrc.get(v)!;
                const c = coloring.get(v) ?? 0;
                return (
                  <span
                    key={v}
                    className="chip"
                    title={`subject: ${s?.subjectCode} · color: ${c}`}
                  >
                    <span
                      className="chip-dot"
                      style={{ background: `hsl(${(c * 57) % 360} 85% 45%)` }}
                    />
                    <code className="font-semibold">{v}</code>
                    <span className="text-slate-500">{s?.subjectCode}</span>
                  </span>
                );
              })}
              {vertices.length === 0 && (
                <span className="text-slate-500">Sin vértices.</span>
              )}
            </div>
          </div>
        </section>

        {/* Grafo en su propio marco */}
        <GraphCard
          title="Grafo (vista general)"
          height={360}
          vertices={vertices}
          edges={edges}
          coloring={coloring}
        />

        {/* Aristas (ahora con tipo y detalle) */}
        <section>
          <h2 className="section-title">Aristas (conflictos)</h2>
          <div className="table-card max-h-96">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="font-mono">u</th>
                  <th className="font-mono">v</th>
                  <th>Tipo</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {edgesDetailed.map((e) => (
                  <tr key={`${e.u}-${e.v}`}>
                    <td className="font-mono">{e.u}</td>
                    <td className="font-mono">{e.v}</td>
                    <td>{e.type}</td>
                    <td className="text-slate-600">{e.detail}</td>
                  </tr>
                ))}
                {edgesDetailed.length === 0 && (
                  <tr>
                    <td className="text-slate-500" colSpan={4}>
                      Sin conflictos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Toggle matrices */}
        <section>
          <button
            className="btn btn-ghost disclosure__btn"
            onClick={() => setShowMatrix((v) => !v)}
            aria-expanded={showMatrix}
            aria-controls="matrices-panel"
          >
            {showMatrix ? "Ocultar matrices" : "Ver matrices"}
          </button>

          {showMatrix && (
            <div id="matrices-panel" className="mt-3 space-y-3">
              <div className="table-card overflow-x-auto">
                <table className="tbl text-xs">
                  <thead>
                    <tr>
                      <th></th>
                      {vertices.map((v) => (
                        <th
                          key={`h-${v}`}
                          className="font-mono whitespace-nowrap"
                        >
                          {v}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vertices.map((rowV, i) => (
                      <tr key={`r-${rowV}`}>
                        <th className="font-mono sticky left-0 bg-slate-50">
                          {rowV}
                        </th>
                        {matrix[i].map((val, j) => (
                          <td key={`${i}-${j}`} className="text-center">
                            {val}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {vertices.length === 0 && (
                      <tr>
                        <td className="text-slate-500">Sin datos.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="note">
                Nota: la diagonal puede ser 0; el grafo es simple no dirigido.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
