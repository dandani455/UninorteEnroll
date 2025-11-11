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
  title: string; // p.ej. NRC
  subtitle?: string; // p.ej. MAT 1031
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
  emphasizeHover?: boolean; // atenua no incidentes al hacer hover
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
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
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

    let t0 = performance.now();
    const loop = (tNow: number) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.max(0, (tNow - t0) / 1000);
      t0 = tNow;

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

      // lookup hover rápido
      const isIncident = (u: string, v: string) =>
        hoverId && (u === hoverId || v === hoverId);

      // aristas
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const [i, j] of layout.edgesIdx) {
        const a = positions[i];
        const b = positions[j];
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        const info = edgeInfo?.get(key);

        // estilo por tipo
        if (info?.type === "same-subject") {
          ctx.setLineDash([5, 4]); // materia repetida → línea discontinua
          ctx.strokeStyle = "rgba(220, 38, 38, 0.55)"; // rojo suave
        } else {
          ctx.setLineDash([]); // choque horario → línea continua
          ctx.strokeStyle = "rgba(2, 6, 23, 0.18)";
        }

        // atenuación si no es incidente al hover
        if (emphasizeHover && hoverId && !isIncident(a.id, b.id)) {
          ctx.globalAlpha = 0.25;
        } else {
          ctx.globalAlpha = 1;
        }

        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // nodos
      for (const p of positions) {
        const hovered = hoverId === p.id;

        // halo
        if (hovered) {
          ctx.beginPath();
          ctx.fillStyle = "rgba(59,130,246,0.12)";
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
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1;
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.stroke();

        // etiqueta
        if (showLabels || hovered) {
          const lbl = labels?.get(p.id);
          const title = lbl?.title ?? p.id;
          const subtitle = lbl?.subtitle;

          ctx.font = "700 11px ui-sans-serif, system-ui, -apple-system";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = "#0f172a";
          ctx.fillText(title, p.x, p.y + 10);

          if (subtitle) {
            ctx.font = "400 10px ui-sans-serif, system-ui, -apple-system";
            ctx.fillStyle = "#475569";
            ctx.fillText(subtitle, p.x, p.y + 22);
          }
        }
      }
    };

    raf = requestAnimationFrame(loop);

    // interacción: hover por proximidad
    const onMove = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;

      // reconstruimos posiciones instantáneas (misma lógica que arriba, pero rápida)
      const tNow = performance.now();
      const toCanvas = (x0: number, y0: number) => {
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
        const [nx, ny] = toCanvas(n.ax + dx, n.ay + dy);
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
    emphasizeHover,
  ]);

  return (
    <div className="w-full rounded-2xl border bg-white shadow-sm overflow-hidden">
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}
