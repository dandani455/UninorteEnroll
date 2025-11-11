"use client";

import GraphNotStatic from "./GraphNotStatic";

export type Edge = [string, string];

type Props = {
  title?: string;
  height?: number; // alto deseado del grafo
  vertices: string[];
  edges: Edge[];
  coloring?: Map<string, number>;
};

export default function GraphCard({
  title = "Grafo (vista general)",
  height = 340,
  vertices,
  edges,
  coloring,
}: Props) {
  return (
    <section aria-label="graph-section">
      <h2 className="section-title">{title}</h2>

      {/* ⚠️ Caja con altura fija para que el canvas tenga dónde pintarse */}
      <div className="graph-shell">
        <div className="graph-box" style={{ height }}>
          <GraphNotStatic
            vertices={vertices}
            edges={edges}
            coloring={coloring}
            height={height}
          />
        </div>
      </div>

      <p className="note mt-2">
        Los nodos flotan levemente (animación suave) y los colores representan
        grupos compatibles (coloración greedy).
      </p>
    </section>
  );
}
