"use client";

import { useEffect, useMemo, useRef } from "react";

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

type Edge = [string, string];

type Props = {
  vertices: string[];
  edges: Edge[];
  coloring?: Map<string, number>;
  height?: number;
};

export default function GraphNotStatic({
  vertices,
  edges,
  coloring,
  height = 420,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /** Layout circular + parámetros de “ondita”, todos DERIVADOS de las props (puros) */
  const layout = useMemo(() => {
    const n = Math.max(vertices.length, 1);

    // seed estable para todo el layout (depende del conjunto de vértices)
    const seedAll =
      vertices.reduce((acc, v) => acc ^ hashStr(v), 0) ^ (n * 2654435761);

    const nodes = vertices.map((id, i) => {
      const theta = (2 * Math.PI * i) / n;
      const rng = xorshift32(seedAll ^ hashStr(id) ^ (i + 1));

      // todo “aleatorio” proviene del PRNG puro -> permitido en render
      const phaseX = rng() * Math.PI * 2;
      const phaseY = rng() * Math.PI * 2;
      const amp = 0.05 + rng() * 0.07; // 0.05..0.12 (amplitud)
      const speed = 0.6 + rng() * 0.6; // 0.6..1.2 (velocidad)

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

    return { nodes, edgesIdx };
  }, [vertices, edges]);

  const colorOf = (id: string) => {
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
      const padX = Math.max(16, w * 0.04); // padding lateral
      const padY = Math.max(12, h * 0.06); // padding superior/inferior
      const s = Math.min(w - padX * 2, h - padY * 2) * 0.45; // radio efectivo
      const cx = w * 0.5;
      const cy = h * 0.48; // muy leve arriba para dejar aire abajo
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

      // anillo guía
      ctx.strokeStyle = "rgba(0,0,0,0.06)";
      ctx.lineWidth = 1;
      const [cx, cy] = toCanvas(0, 0);
      const r = Math.min(canvas.clientWidth, height) * 0.42;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // posiciones actuales (ondita)
      const positions = layout.nodes.map((n) => {
        const dx = n.amp * Math.sin(n.phaseX + tNow * 0.0015 * n.speed);
        const dy = n.amp * Math.cos(n.phaseY + tNow * 0.0012 * n.speed);
        const [x, y] = toCanvas(n.ax + dx, n.ay + dy);
        return { id: n.id, x, y };
      });

      // aristas
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(2,6,23,0.14)";
      ctx.beginPath();
      for (const [i, j] of layout.edgesIdx) {
        const a = positions[i];
        const b = positions[j];
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();

      // nodos
      for (const p of positions) {
        ctx.beginPath();
        ctx.fillStyle = colorOf(p.id);
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1;
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [layout, coloring, height]);

  return (
    <div className="w-full rounded-2xl border bg-white shadow-sm overflow-hidden">
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}
