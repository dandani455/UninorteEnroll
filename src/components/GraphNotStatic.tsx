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
    return (x >>> 0) / 0x1_0000_0000;
  };
}

export type Edge = [string, string];

export type EdgeInfo = {
  type: "same-subject" | "time-overlap";
  subjectCode?: string;
};

export type NodeLabel = {
  title: string;
  subtitle?: string;
  color?: string;
};

type Props = {
  vertices: string[];
  edges: Edge[];
  coloring?: Map<string, number>;
  height?: number;
  showGuide?: boolean;
  showLabels?: boolean;
  edgeInfo?: Map<string, EdgeInfo>;
  labels?: Map<string, NodeLabel>;
  emphasizeHover?: boolean;
  performanceMode?: boolean; 
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
  performanceMode = false, // 🔥 NUEVO
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  /** Layout circular */
  const layout = useMemo(() => {
    const n = Math.max(vertices.length, 1);
    const seedAll =
      vertices.reduce((acc, v) => acc ^ hashStr(v), 0) ^ (n * 2654435761);

    const nodes = vertices.map((id, i) => {
      const theta = (2 * Math.PI * i) / n;
      const rng = xorshift32(seedAll ^ hashStr(id) ^ (i + 1));

      return {
        id,
        theta,
        ax: Math.cos(theta),
        ay: Math.sin(theta),

        // 🔥 Si performanceMode=true, amplitud = 0 = SIN animación
        phaseX: rng() * Math.PI * 2,
        phaseY: rng() * Math.PI * 2,
        amp: performanceMode ? 0 : 0.05 + rng() * 0.07, // ← cambios
        speed: performanceMode ? 0 : 0.6 + rng() * 0.6, // ← cambios
      };
    });

    const index = new Map(vertices.map((v, i) => [v, i]));
    const edgesIdx = edges
      .filter(([u, v]) => index.has(u) && index.has(v))
      .map(([u, v]) => [index.get(u) as number, index.get(v) as number]);

    return { nodes, edgesIdx, index };
  }, [vertices, edges, performanceMode]);

  const colorOf = (id: string) => {
    const forced = labels?.get(id)?.color;
    if (forced) return forced;
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

      // Si performanceMode = true ⇒ redibujar cada 3 frames
      if (performanceMode && Math.floor(tNow) % 3 !== 0) return;

      const dt = performanceMode ? 0 : Math.max(0, (tNow - t0) / 1000);
      t0 = tNow;

      ctx.clearRect(0, 0, canvas.clientWidth, height);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.clientWidth, height);

      if (showGuide) {
        ctx.strokeStyle = "rgba(2,6,23,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const [cx, cy] = toCanvas(0, 0);
        const r = Math.min(canvas.clientWidth, height) * 0.46;
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      const positions = layout.nodes.map((n) => {
        const dx = performanceMode
          ? 0
          : n.amp * Math.sin(n.phaseX + tNow * 0.0015 * n.speed);
        const dy = performanceMode
          ? 0
          : n.amp * Math.cos(n.phaseY + tNow * 0.0012 * n.speed);
        const [x, y] = toCanvas(n.ax + dx, n.ay + dy);
        return { id: n.id, x, y };
      });

      // ---- Aristas ----
      ctx.lineWidth = performanceMode ? 1.0 : 1.6;
      for (const [i, j] of layout.edgesIdx) {
        const a = positions[i];
        const b = positions[j];
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        const info = edgeInfo?.get(key);

        ctx.beginPath();
        if (info?.type === "same-subject") {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = "rgba(240, 60, 60, 0.4)";
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = "rgba(0,0,0,0.16)";
        }

        if (
          emphasizeHover &&
          hoverId &&
          !(a.id === hoverId || b.id === hoverId)
        ) {
          ctx.globalAlpha = 0.15;
        } else {
          ctx.globalAlpha = 1;
        }

        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      // ---- Nodos ----
      for (const p of positions) {
        const hovered = hoverId === p.id;

        if (hovered) {
          ctx.beginPath();
          ctx.fillStyle = "rgba(59,130,246,0.12)";
          ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.fillStyle = colorOf(p.id);
        ctx.arc(p.x, p.y, performanceMode ? 5 : 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1;
        ctx.arc(p.x, p.y, performanceMode ? 6 : 8, 0, Math.PI * 2);
        ctx.stroke();

        if (showLabels || hovered) {
          const lbl = labels?.get(p.id);
          ctx.font = performanceMode
            ? "600 10px system-ui"
            : "700 11px system-ui";

          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = "#0f172a";
          ctx.fillText(lbl?.title ?? p.id, p.x, p.y + 8);

          if (lbl?.subtitle) {
            ctx.font = "400 9px system-ui";
            ctx.fillStyle = "#475569";
            ctx.fillText(lbl.subtitle, p.x, p.y + 18);
          }
        }
      }
    };

    raf = requestAnimationFrame(loop);

    const onMove = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;

      let nearest: { id: string; d2: number } | null = null;
      for (const n of layout.nodes) {
        const [nx, ny] = toCanvas(n.ax, n.ay);
        const d2 = (nx - x) ** 2 + (ny - y) ** 2;
        if (!nearest || d2 < nearest.d2) nearest = { id: n.id, d2 };
      }
      setHoverId(nearest && nearest.d2 < 20 * 20 ? nearest.id : null);
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", () => setHoverId(null));

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("mousemove", onMove);
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
    performanceMode,
  ]);

  return (
    <div className="w-full rounded-2xl border bg-white shadow-sm overflow-hidden">
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}
