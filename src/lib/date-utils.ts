function getTzOffset(): string {
  const offset = new Date().getTimezoneOffset();
  const sign = offset <= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

export function dayStart(dateStr: string): string {
  return `${dateStr}T00:00:00${getTzOffset()}`;
}

export function dayEnd(dateStr: string): string {
  return `${dateStr}T23:59:59${getTzOffset()}`;
}
