"use client";

import GraphNotStatic, { Edge, EdgeInfo, NodeLabel } from "./GraphNotStatic";

type Props = {
  title?: string;
  height?: number;
  vertices: string[];
  edges: Edge[];
  coloring?: Map<string, number>;
  // extras para mejorar legibilidad
  labels?: Map<string, NodeLabel>;
  edgeInfo?: Map<string, EdgeInfo>;
};

export default function GraphCard({
  title = "Grafo (vista general)",
  height = 360,
  vertices,
  edges,
  coloring,
  labels,
  edgeInfo,
}: Props) {
  return (
    <section aria-label="graph-section">
      <h2 className="section-title">{title}</h2>

      {/* Leyenda compacta */}
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
          <span>
            Arista discontinua = misma materia (secciones alternativas)
          </span>
        </div>
      </div>

      {/* Marco del grafo */}
      <div className="graph-shell">
        <div className="graph-box" style={{ height }}>
          <GraphNotStatic
            vertices={vertices}
            edges={edges}
            coloring={coloring}
            height={height}
            showGuide={false}
            showLabels={true}
            labels={labels}
            edgeInfo={edgeInfo}
            emphasizeHover={true}
          />
        </div>
      </div>

      <p className="note mt-2">
        Pasa el mouse por un nodo para resaltar sus conflictos. Las etiquetas
        muestran
        <b> NRC</b> y <b>materia</b>.
      </p>
    </section>
  );
}
