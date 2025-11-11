"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSchedule } from "@/store/schedule";
import GraphCard from "@/components/GraphCard";

type Row = (string | number | boolean)[];
const toCsv = (rows: Row[]) =>
  rows
    .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");

export default function GraphPage() {
  const { sections, graph, metrics, sectionByNrc } = useSchedule();

  /* --------- base --------- */
  const vertices = useMemo(() => {
    return [...new Set(sections.map((s) => s.nrc))].sort(
      (a, b) => (graph.get(b)?.size ?? 0) - (graph.get(a)?.size ?? 0)
    );
  }, [sections, graph]);

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

  /* --------- greedy coloring --------- */
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

  /* --------- matriz (se calcula sólo si se muestra) --------- */
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

  /* --------- CSV --------- */
  const csvEdges = useMemo(() => {
    const rows: Row[] = [["u", "v"]];
    edges.forEach(([u, v]) => rows.push([u, v]));
    return toCsv(rows);
  }, [edges]);

  const csvAdj = useMemo(() => {
    if (!showMatrix) return "";
    const header: Row = ["", ...vertices];
    const body: Row[] = matrix.map((row, i) => [vertices[i], ...row]);
    return toCsv([header, ...body]);
  }, [showMatrix, matrix, vertices]);

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
              download="edges.csv"
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

        {/* Grafo en su propio marco (debajo de Vértices, arriba de Matrices) */}
        <GraphCard
          title="Grafo (vista general)"
          height={340}
          vertices={vertices}
          edges={edges}
          coloring={coloring}
        />

        {/* Aristas (debajo del grafo) */}
        <section>
          <h2 className="section-title">Aristas (conflictos)</h2>
          <div className="table-card max-h-96">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="font-mono">u</th>
                  <th className="font-mono">v</th>
                </tr>
              </thead>
              <tbody>
                {edges.map(([u, v]) => (
                  <tr key={`${u}-${v}`}>
                    <td className="font-mono">{u}</td>
                    <td className="font-mono">{v}</td>
                  </tr>
                ))}
                {edges.length === 0 && (
                  <tr>
                    <td className="text-slate-500" colSpan={2}>
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
