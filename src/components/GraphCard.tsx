"use client";

import GraphNotStatic, { Edge, EdgeInfo, NodeLabel } from "./GraphNotStatic";

type Props = {
  title?: string;
  height?: number;
  vertices: string[];
  edges: Edge[];
  coloring?: Map<string, number>;
  labels?: Map<string, NodeLabel>;
  edgeInfo?: Map<string, EdgeInfo>;

  // 🔥 Necesario para que Vercel compile
  performanceMode?: boolean;
};

export default function GraphCard({
  title = "Grafo (vista general)",
  height = 360,
  vertices,
  edges,
  coloring,
  labels,
  edgeInfo,

  // 🔥 default seguro
  performanceMode = false,
}: Props) {
  /* ============================
     REGLAS AUTOMÁTICAS DE RENDIMIENTO
  ===============================*/

  const N = vertices.length;

  // labels solo si hay pocos nodos
  const showLabels = N <= 25;

  // hover solo si no colapsa performance
  const emphasizeHover = N <= 40;

  // modo rendimiento: baja animación si hay muchos nodos
  const computedPerformanceMode = performanceMode || N >= 60;

  return (
    <section aria-label="graph-section">
      <h2 className="section-title">{title}</h2>

      {/* ----- Leyenda ----- */}
      <div className="legend mb-2">
        <div className="legend__item">
          <span
            className="legend__swatch"
            style={{ background: "hsl(200 90% 46%)" }}
          />
          <span>
            Nodo = NRC (color por compatibilidad <i>greedy</i>)
          </span>
        </div>
        <div className="legend__item">
          <span className="legend__line legend__line--solid" />
          <span>Arista continua = choque horario</span>
        </div>
        <div className="legend__item">
          <span className="legend__line legend__line--dash" />
          <span>Arista discontinua = misma materia (alternativas)</span>
        </div>
      </div>

      {/* ----- Marco del grafo ----- */}
      <div className="graph-shell">
        <div className="graph-box" style={{ height }}>
          <GraphNotStatic
            vertices={vertices}
            edges={edges}
            coloring={coloring}
            height={height}
            showGuide={false}
            showLabels={showLabels}
            labels={labels}
            edgeInfo={edgeInfo}
            emphasizeHover={emphasizeHover}
            performanceMode={computedPerformanceMode} // ← OK
          />
        </div>
      </div>

      <p className="note mt-2">
        Pasa el mouse por un nodo para resaltar sus conflictos. Las etiquetas
        solo se muestran cuando el grafo es pequeño.
      </p>
    </section>
  );
}
  