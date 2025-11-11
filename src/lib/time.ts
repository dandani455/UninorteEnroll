export const DAYS = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"] as const;
export type DayKey = (typeof DAYS)[number];

/** Convierte "HH:MM" | 830 | Date a minutos */
export function toMin(hhmm: string | number | Date) {
  // Date => horas/minutos
  if (hhmm instanceof Date) {
    return hhmm.getHours() * 60 + hhmm.getMinutes();
  }

  // number => 830 -> 08:30, 1430 -> 14:30
  if (typeof hhmm === "number") {
    const h = Math.floor(hhmm / 100);
    const m = hhmm % 100;
    return h * 60 + m;
  }

  // string (varios formatos): "08:30", "8:30", "0830", "830"
  const s = String(hhmm).trim();
  if (s.includes(":")) {
    const [hStr, mStr] = s.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    return h * 60 + m;
  } else {
    // "830" o "0830"
    const num = Number(s);
    const h = Math.floor(num / 100);
    const m = num % 100;
    return h * 60 + m;
  }
}

export function overlap(
  a: { start: number; end: number },
  b: { start: number; end: number }
) {
  return a.start < b.end && b.start < a.end;
}
