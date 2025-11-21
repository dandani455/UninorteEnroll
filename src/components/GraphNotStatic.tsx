"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** -------- PRNG puro con seed (xorshift32) -------- */
function hashStr(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function xorshift32(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0x1_0000_0000; // [0,1)
  };
}

export type Edge = [string, string];

export type EdgeInfo = {
  type: "same-subject" | "time-overlap";
  subjectCode?: string; // útil para colorear por materia si quieres
};

export type NodeLabel = {
  title: string; // p.ej. nombre de materia
  subtitle?: string; // p.ej. NRC
  color?: string; // opcional (si quieres forzar un color)
};

type Props = {
  vertices: string[];
  edges: Edge[];
  coloring?: Map<string, number>; // color por grupo (greedy)
  height?: number;
  showGuide?: boolean; // círculo guía
  showLabels?: boolean; // etiquetas visibles
  edgeInfo?: Map<string, EdgeInfo>; // clave "u|v" ordenada
  labels?: Map<string, NodeLabel>; // info para cada vértice
  emphasizeHover?: boolean; // atenúa no incidentes al hacer hover
};

export default function GraphNotStatic({
  vertices,
  edges,
  coloring,
  height = 420,
  showGuide = false,
  showLabels = false,
  edgeInfo,
  labels,
  emphasizeHover = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  /** Layout circular + parámetros de “ondita”, todos DERIVADOS de las props (puros) */
  const layout = useMemo(() => {
    const n = Math.max(vertices.length, 1);
    const seedAll =
      vertices.reduce((acc, v) => acc ^ hashStr(v), 0) ^ (n * 2654435761);

    const nodes = vertices.map((id, i) => {
      const theta = (2 * Math.PI * i) / n;
      const rng = xorshift32(seedAll ^ hashStr(id) ^ (i + 1));

      const phaseX = rng() * Math.PI * 2;
      const phaseY = rng() * Math.PI * 2;
      const amp = 0.05 + rng() * 0.07;
      const speed = 0.6 + rng() * 0.6;

      return {
        id,
        theta,
        ax: Math.cos(theta),
        ay: Math.sin(theta),
        phaseX,
        phaseY,
        amp,
        speed,
      };
    });

    const index = new Map(vertices.map((v, i) => [v, i]));
    const edgesIdx = edges
      .filter(([u, v]) => index.has(u) && index.has(v))
      .map(
        ([u, v]) =>
          [index.get(u) as number, index.get(v) as number] as [number, number]
      );

    return { nodes, edgesIdx, index };
  }, [vertices, edges]);

  const colorOf = (id: string) => {
    // color forzado por etiqueta
    const forced = labels?.get(id)?.color;
    if (forced) return forced;
    // color por grupo (greedy)
    const c = coloring?.get(id) ?? 0;
    const hue = (c * 57) % 360;
    return `hsl(${hue} 85% 45%)`;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const parent = canvas.parentElement!;
      const w = parent.clientWidth;
      canvas.width = Math.floor(w * DPR);
      canvas.height = Math.floor(height * DPR);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const toCanvas = (x: number, y: number) => {
      const w = canvas.clientWidth;
      const h = height;
      const padX = Math.max(16, w * 0.06);
      const padY = Math.max(12, h * 0.1);
      const s = Math.min(w - padX * 2, h - padY * 2) * 0.48;
      const cx = w * 0.5;
      const cy = h * 0.5;
      return [cx + x * s, cy + y * s] as const;
    };

    // 🔍 vecinos del nodo en hover (para enfoque)
    const hoverNeighbors = new Set<string>();
    if (hoverId && emphasizeHover) {
      for (const [i, j] of layout.edgesIdx) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        if (a.id === hoverId) hoverNeighbors.add(b.id);
        if (b.id === hoverId) hoverNeighbors.add(a.id);
      }
    }

    let t0 = performance.now();
    const loop = (tNow: number) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.max(0, (tNow - t0) / 1000);
      t0 = tNow;
      void dt; // por si queremos usarlo luego

      // fondo
      ctx.clearRect(0, 0, canvas.clientWidth, height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.clientWidth, height);

      // guía opcional
      if (showGuide) {
        ctx.strokeStyle = "rgba(2,6,23,0.07)";
        ctx.lineWidth = 1;
        const [cx, cy] = toCanvas(0, 0);
        const r = Math.min(canvas.clientWidth, height) * 0.46;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // posiciones (ondita)
      const positions = layout.nodes.map((n) => {
        const dx = n.amp * Math.sin(n.phaseX + tNow * 0.0015 * n.speed);
        const dy = n.amp * Math.cos(n.phaseY + tNow * 0.0012 * n.speed);
        const [x, y] = toCanvas(n.ax + dx, n.ay + dy);
        return { id: n.id, x, y };
      });

      // ===================== DIBUJO DE ARISTAS =====================
      ctx.lineWidth = 1.6;
      for (const [i, j] of layout.edgesIdx) {
        const a = positions[i];
        const b = positions[j];
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        const info = edgeInfo?.get(key);

        // 🔎 si hay hover + énfasis, solo mostramos aristas incidentes al nodo hover
        const edgeIsRelevant =
          !emphasizeHover || !hoverId || a.id === hoverId || b.id === hoverId;

        if (!edgeIsRelevant) {
          // las ignoramos directamente para que “desaparezcan”
          continue;
        }

        // estilo por tipo
        if (info?.type === "same-subject") {
          ctx.setLineDash([5, 4]); // materia repetida → línea discontinua
          ctx.strokeStyle = "rgba(220, 38, 38, 0.55)"; // rojo suave
        } else {
          ctx.setLineDash([]); // choque horario → línea continua
          ctx.strokeStyle = "rgba(15, 23, 42, 0.22)";
        }

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // ===================== DIBUJO DE NODOS =====================
      for (const p of positions) {
        const isHover = hoverId === p.id;
        const isNeighbor = hoverNeighbors.has(p.id);

        const nodeRelevant =
          !emphasizeHover || !hoverId || isHover || isNeighbor;

        // nodos no relevantes se vuelven muy transparentes
        ctx.globalAlpha = nodeRelevant ? 1 : 0.08;

        // halo
        if (isHover) {
          ctx.beginPath();
          ctx.fillStyle = "rgba(59,130,246,0.16)";
          ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
          ctx.fill();
        }

        // círculo principal
        ctx.beginPath();
        ctx.fillStyle = colorOf(p.id);
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();

        // borde sutil
        ctx.beginPath();
        ctx.strokeStyle = "rgba(15,23,42,0.16)";
        ctx.lineWidth = 1;
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.stroke();

        // etiquetas (siempre visibles pero más claras si no es relevante)
        if (showLabels || isHover) {
          const lbl = labels?.get(p.id);
          const title = lbl?.title ?? p.id;
          const subtitle = lbl?.subtitle;

          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          ctx.font = "700 11px ui-sans-serif, system-ui, -apple-system";
          ctx.fillStyle = nodeRelevant ? "#0f172a" : "#cbd5e1";
          ctx.fillText(title, p.x, p.y + 10);

          if (subtitle) {
            ctx.font = "400 10px ui-sans-serif, system-ui, -apple-system";
            ctx.fillStyle = nodeRelevant ? "#64748b" : "#d1d5db";
            ctx.fillText(subtitle, p.x, p.y + 22);
          }
        }
      }

      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(loop);

    // interacción: hover por proximidad
    const onMove = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;

      const tNow = performance.now();
      const toCanvasInner = (x0: number, y0: number) => {
        const w = canvas.clientWidth;
        const h = height;
        const padX = Math.max(16, w * 0.06);
        const padY = Math.max(12, h * 0.1);
        const s = Math.min(w - padX * 2, h - padY * 2) * 0.48;
        const cx = w * 0.5;
        const cy = h * 0.5;
        return [cx + x0 * s, cy + y0 * s] as const;
      };

      let nearest: { id: string; d2: number } | null = null;
      for (const n of layout.nodes) {
        const dx = n.amp * Math.sin(n.phaseX + tNow * 0.0015 * n.speed);
        const dy = n.amp * Math.cos(n.phaseY + tNow * 0.0012 * n.speed);
        const [nx, ny] = toCanvasInner(n.ax + dx, n.ay + dy);
        const d2 = (nx - x) * (nx - x) + (ny - y) * (ny - y);
        if (!nearest || d2 < nearest.d2) nearest = { id: n.id, d2 };
      }
      setHoverId(nearest && nearest.d2 < 22 * 22 ? nearest.id : null);
    };

    const onLeave = () => setHoverId(null);

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [
    layout,
    coloring,
    height,
    showGuide,
    showLabels,
    edgeInfo,
    labels,
    hoverId, // 👈 importante: ahora el efecto reacciona al hover
    emphasizeHover,
  ]);

  return (
    <div className="w-full rounded-2xl border bg-white shadow-sm overflow-hidden">
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}
