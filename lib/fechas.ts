// Fechas de calendario en hora de Madrid, como texto AAAA-MM-DD.
// Las páginas corren en el runtime edge, que va en UTC: con toISOString(),
// entre las 00:00 y la 01:00 (02:00 en verano) "hoy" seguía siendo ayer.

export function hoyMadrid(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
}

export function sumarDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
}

export function unAnoAntes(iso: string): string {
  const y = Number(iso.slice(0, 4)) - 1;
  const md = iso.slice(5, 10);
  return md === "02-29" ? `${y}-02-28` : `${y}-${md}`;
}
