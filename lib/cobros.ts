// Regla única para "cobro pendiente que pide acción vuestra". La usan el
// Resumen (lista de 14 días y "Pendiente de cobro total") y el correo diario
// de cobros, para que digan lo mismo.
// Una reserva pendiente NO pide acción si la cobra Booking (Booking Payments,
// tarjeta virtual o canal Booking) o si es de web o teléfono con un anticipo
// ya cobrado (el resto se paga a la salida).
export function requiereAccionCobro(r: { forma_pago?: unknown; canal?: unknown; anticipo?: unknown }): boolean {
  const fp = (r.forma_pago ?? "").toString().toLowerCase();
  const canal = (r.canal ?? "").toString().toLowerCase();
  const anticipo = Number(r.anticipo ?? 0);
  if (/booking[\s_-]*payments|virtual[\s_-]*card|virtualcard|prepago.*ota|tarjeta.*virtual/i.test(fp)) return false;
  if (canal === "booking") return false;
  // feedback Juan 10.08: si NO hay anticipo, como Álvaro, SÍ es pendiente real
  if ((canal === "web_propia" || canal === "telefono") && anticipo > 0) return false;
  return true;
}
