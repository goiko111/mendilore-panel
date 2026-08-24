/**
 * Tipos compartidos entre módulos del scraper.
 * El payload `ReservaScraped` se ajusta 1:1 al schema Supabase `public.reservas`
 * para que el webhook del panel pueda hacer upsert directo sin transformaciones.
 */

export type Canal =
  | 'directo'
  | 'telefono'
  | 'booking'
  | 'airbnb'
  | 'expedia'
  | 'web_propia'
  | 'walk_in'
  | 'otro';

export type EstadoCobro = 'cobrado' | 'pendiente' | 'parcial' | 'fallido' | 'reembolsado';

export type EstadoReserva = 'confirmada' | 'completada' | 'cancelada' | 'no_show' | 'pendiente';

export type Habitacion =
  | 'cala'
  | 'nube'
  | 'margarita'
  | 'lino'
  | 'limonero'
  | 'lavanda';

export interface ActorInput {
  username: string;
  password: string;
  webhookUrl?: string;
  webhookSecret: string;
  monthsAhead?: number;
  monthsBack?: number;
  headless?: boolean;
  debug?: boolean;
  /** Loguea las líneas con importe del modal cuando no se extrae ningún complementario */
  debugComplementarios?: boolean;
}

export interface ReservaScraped {
  /** ID MisterPlan format "N-XXXXXXX" — único, idempotency key del upsert */
  id_reserva: string;
  /** Localizador externo del canal (Booking, Airbnb…) si MisterPlan lo expone */
  localizador_externo: string | null;
  canal: Canal;
  habitacion: Habitacion | string;
  fecha_in: string;  // YYYY-MM-DD
  fecha_out: string; // YYYY-MM-DD
  noches: number;
  huesped_nombre: string;
  huesped_apellidos: string | null;
  huesped_email: string | null;
  huesped_telefono: string | null;
  huesped_pais: string | null;
  huesped_documento: string | null;
  importe_total: number;
  importe_alojamiento?: number | null;
  importe_complementarios?: number;
  importe_moneda: string;
  anticipo: number;
  pendiente_cobro: number;
  estado_reserva: EstadoReserva;
  estado_cobro: EstadoCobro;
  forma_pago: string | null;
  factura_num: string | null;
  /** ISO 8601 — momento en que el huésped/MisterPlan crearon la reserva */
  fecha_reserva: string;
  observaciones: string | null;
  /** numero de huéspedes (e.g. "2p" en planning bar) */
  num_huespedes: number | null;
  /** scraped raw payload — útil para debugging si parsing está mal */
  _raw?: Record<string, unknown>;
}

export interface ScrapingError {
  step: string;
  error: string;
  url?: string;
  reservaIndex?: number;
}

export interface ScraperResult {
  source: 'misterplan';
  scrapedAt: string;
  monthsScraped: number;
  reservas: ReservaScraped[];
  errors: ScrapingError[];
  sessionRefreshed: boolean;
}


