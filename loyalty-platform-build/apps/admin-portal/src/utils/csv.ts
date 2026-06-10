/**
 * Download CSV helper.
 * Accepts either a raw Response (from streaming CSV endpoints) or an array of objects.
 */
export async function downloadCsv(
  source: Response | Record<string, unknown>[],
  filename: string,
): Promise<void> {
  let blob: Blob;

  if (source instanceof Response) {
    blob = await source.blob();
  } else {
    // Convert array of objects to CSV
    if (source.length === 0) {
      blob = new Blob([''], { type: 'text/csv' });
    } else {
      const headers = Object.keys(source[0]!);
      const rows = source.map((row) =>
        headers.map((h) => csvEscape(String(row[h] ?? ''))).join(','),
      );
      const csv = [headers.join(','), ...rows].join('\n');
      blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
