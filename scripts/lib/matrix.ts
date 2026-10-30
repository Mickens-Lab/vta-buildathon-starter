// Reads the who-can-call-what table out of docs/VTC-SURFACE.md, so the matrix has ONE hand-maintained copy.
// The cells there are prose ("OK (update verified: ...)"); here each is reduced to a short outcome label.
export const PERSONAS = ["stranger", "applicant", "member", "admin"] as const;
export type Persona = (typeof PERSONAS)[number];
export type Outcome = "OK" | "refused" | "notFound" | "notMember" | "-" | "untried" | "other";

export interface MatrixRow {
  operation: string;
  cells: Record<Persona, { outcome: Outcome; text: string }>;
}

const HEADING = /^##\s+Who-can-call-what/i;

/** Split a markdown table row on `|`, ignoring pipes inside backtick spans. */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let tick = false;
  for (const ch of line.trim().replace(/^\||\|$/g, "")) {
    if (ch === "`") tick = !tick;
    if (ch === "|" && !tick) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function classify(text: string): Outcome {
  const t = text.trim();
  if (t === "" || t === "-") return "-";
  if (/^OK\b/.test(t)) return "OK";
  if (/^refused\b/i.test(t)) return "refused";
  if (/^notFound\b/.test(t)) return "notFound";
  if (/^not(A)?Member\b/.test(t)) return "notMember";
  if (/^not (tried|probed|exercised)/i.test(t)) return "untried";
  return "other";
}

/** Parse the first table under the "Who-can-call-what" heading. Throws when the table is missing or malformed. */
export function parseMatrix(markdown: string): MatrixRow[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => HEADING.test(l));
  if (start < 0) throw new Error('no "Who-can-call-what" heading found');
  const rows: MatrixRow[] = [];
  let header: string[] | undefined;
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    if (!line.trim().startsWith("|")) { if (header) break; else continue; }
    const cols = splitRow(line);
    if (!header) { header = cols; continue; }
    if (/^[-: ]+$/.test(cols[0])) continue; // separator row
    if (cols.length !== 5) throw new Error(`matrix row has ${cols.length} columns, expected 5: ${line.slice(0, 60)}`);
    // Persona columns are the header cells, in order; fail loudly if the doc reorders them.
    const cells = {} as MatrixRow["cells"];
    PERSONAS.forEach((p, i) => {
      if (!header![i + 1].toLowerCase().startsWith(p)) throw new Error(`column ${i + 2} should be "${p}", found "${header![i + 1]}"`);
      cells[p] = { outcome: classify(cols[i + 1]), text: cols[i + 1] };
    });
    rows.push({ operation: cols[0].replace(/`/g, ""), cells });
  }
  if (!rows.length) throw new Error("matrix table has no rows");
  return rows;
}

/** A fixed-width text table: one outcome label per persona. */
export function formatMatrix(rows: MatrixRow[]): string {
  const ops = rows.map((r) => r.operation.length > 70 ? r.operation.slice(0, 67) + "..." : r.operation);
  const w = Math.max("operation".length, ...ops.map((o) => o.length));
  const colw = 10;
  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
  const out = [pad("operation", w) + "  " + PERSONAS.map((p) => pad(p, colw)).join(" "), "-".repeat(w + 2 + PERSONAS.length * (colw + 1))];
  // "other" cells show their first word, so the table says something rather than "other".
  const label = (c: MatrixRow["cells"][Persona]) => c.outcome !== "other" ? c.outcome : (c.text.replace(/`/g, "").split(/[\s:(]/)[0] || "other").slice(0, colw - 1);
  rows.forEach((r, i) => out.push(pad(ops[i], w) + "  " + PERSONAS.map((p) => pad(label(r.cells[p]), colw)).join(" ")));
  return out.join("\n");
}
