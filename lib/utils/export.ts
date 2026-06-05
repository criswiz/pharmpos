import Papa from "papaparse";

export function downloadCsv<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
): void {
  const csv = Papa.unparse(rows);
  // BOM so Excel opens UTF-8 correctly
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function openPrintReport(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const thCells = headers.map((h) => `<th>${h}</th>`).join("");
  const tRows = rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; padding: 16px; }
  h1 { font-size: 15px; font-weight: 700; margin-bottom: 2px; }
  p.sub { font-size: 10px; color: #666; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #ecfdf5; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; border-bottom: 2px solid #047857; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  @media print { body { padding: 0; } @page { margin: 12mm; } }
</style>
</head>
<body>
  <h1>${title}</h1>
  <p class="sub">${subtitle}</p>
  <table>
    <thead><tr>${thCells}</tr></thead>
    <tbody>${tRows}</tbody>
  </table>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
