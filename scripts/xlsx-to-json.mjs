import fs from "fs";
import path from "path";
import xlsx from "xlsx";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rutas
const IN_XLSX = path.join(
  __dirname,
  "..",
  "data-source",
  "horarios_uninorte.xlsx"
);
const OUT_DIR = path.join(__dirname, "..", "public", "data");

// Util: asegurar carpeta de salida
fs.mkdirSync(OUT_DIR, { recursive: true });

/** Normaliza día a siglas esperadas (LUN, MAR, MIE, JUE, VIE, SAB, DOM) */
function normDay(d) {
  const s = String(d || "")
    .trim()
    .toUpperCase();
  if (s.startsWith("LU")) return "LUN";
  if (s.startsWith("MA") && !s.startsWith("MIE")) return "MAR";
  if (s.startsWith("MI") || s.startsWith("MIE")) return "MIE";
  if (s.startsWith("JU")) return "JUE";
  if (s.startsWith("VI")) return "VIE";
  if (s.startsWith("SA") || s.startsWith("SÁ")) return "SAB";
  if (s.startsWith("DO")) return "DOM";
  // ya viene en siglas o vacío:
  return ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"].includes(s) ? s : s;
}

/** Normaliza horas a "HH:MM" desde string | number | Date (incluye fracción del día de Excel) */
function toHHMM(v) {
  if (v instanceof Date) {
    const hh = String(v.getHours()).padStart(2, "0");
    const mm = String(v.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  if (typeof v === "number") {
    // Puede ser fracción del día (0..1) o 830/1330
    if (v >= 0 && v < 1) {
      const total = Math.round(v * 24 * 60);
      const hh = String(Math.floor(total / 60)).padStart(2, "0");
      const mm = String(total % 60).padStart(2, "0");
      return `${hh}:${mm}`;
    } else {
      const hh = String(Math.floor(v / 100)).padStart(2, "0");
      const mm = String(v % 100).padStart(2, "0");
      return `${hh}:${mm}`;
    }
  }
  const s = String(v || "").trim();
  if (!s) return "00:00";
  if (s.includes(":")) {
    const [h, m = "00"] = s.split(":");
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  // "830" -> "08:30"
  const n = Number(s);
  if (!Number.isNaN(n)) {
    const hh = String(Math.floor(n / 100)).padStart(2, "0");
    const mm = String(n % 100).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  return s;
}

function writeJSON(name, data) {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  console.log(`✓ ${name} (${data.length} filas)`);
}

function numberOrNull(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// ---- Conversores por hoja ----

function convertSubjects(wb) {
  // Espera columnas: subjectCode, subjectName, semester, credits
  const ws = wb.Sheets["Subjects"];
  if (!ws) throw new Error("No existe la hoja 'Subjects'");
  const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });

  const out = rows
    .map((r) => ({
      subjectCode: String(
        r.subjectCode || r.code || r.SubjectCode || ""
      ).trim(),
      subjectName: String(
        r.subjectName || r.name || r.SubjectName || ""
      ).trim(),
      semester: numberOrNull(r.semester ?? r.Semester) ?? undefined,
      credits: numberOrNull(r.credits ?? r.Credits) ?? undefined,
    }))
    .filter((r) => r.subjectCode && r.subjectName);

  writeJSON("subjects.json", out);
}

function convertProfessors(wb) {
  // Espera columnas: professorId, professorName, email, department (opcionales)
  const ws = wb.Sheets["Professors"];
  if (!ws) throw new Error("No existe la hoja 'Professors'");
  const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });

  const out = rows
    .map((r) => ({
      professorId: String(r.professorId || r.id || r.ProfessorId || "").trim(),
      professorName: String(
        r.professorName || r.name || r.ProfessorName || ""
      ).trim(),
      email: String(r.email || r.Email || "").trim(),
      department: String(r.department || r.Department || "").trim(),
    }))
    .filter((r) => r.professorId && r.professorName);

  writeJSON("professors.json", out);
}

function convertSections(wb) {
  // Espera columnas: nrc, subjectCode, professorId
  const ws = wb.Sheets["Sections"];
  if (!ws) throw new Error("No existe la hoja 'Sections'");
  const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });

  const out = rows
    .map((r) => ({
      nrc: String(r.nrc || r.NRC || "").trim(),
      subjectCode: String(r.subjectCode || r.SubjectCode || "").trim(),
      professorId: String(r.professorId || r.ProfessorId || "").trim(),
    }))
    .filter((r) => r.nrc && r.subjectCode && r.professorId);

  writeJSON("sections.json", out);
}

function convertMeetings(wb) {
  // Espera columnas: nrc, day, start, end
  const ws = wb.Sheets["Meetings"];
  if (!ws) throw new Error("No existe la hoja 'Meetings'");
  const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });

  const out = rows
    .map((r) => ({
      nrc: String(r.nrc || r.NRC || "").trim(),
      day: normDay(r.day ?? r.Day),
      start: toHHMM(r.start ?? r.Start),
      end: toHHMM(r.end ?? r.End),
    }))
    .filter((r) => r.nrc && r.day);

  writeJSON("meetings.json", out);
}

// ---- Main ----
(function main() {
  if (!fs.existsSync(IN_XLSX)) {
    console.error(`❌ No se encontró el archivo: ${IN_XLSX}`);
    process.exit(1);
  }
  console.log(`Leyendo: ${IN_XLSX}`);
  const wb = xlsx.readFile(IN_XLSX, { cellDates: true });

  convertSubjects(wb);
  convertProfessors(wb);
  convertSections(wb);
  convertMeetings(wb);

  console.log(`✅ Datos exportados en: ${OUT_DIR}`);
})();
