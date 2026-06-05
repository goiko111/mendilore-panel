-- ============================================================================
-- Migration 0003 — Seed inicial
-- ============================================================================
-- Inserta los 6 competidores validados en sesión 9 (D-118)
-- ============================================================================

insert into public.competidores (nombre, booking_slug, booking_url, web_propia, estrellas, notas)
values
  ('Casa Rural Higeralde', 'casa-rural-higeralde', 'https://www.booking.com/hotel/es/casa-rural-higeralde.html', 'https://casahigeralde.com', 1, 'Casa rural pequeña, segmento más cercano a Casa Mendilore. 1.235 reviews, 9.5★'),
  ('Hotel Jauregui (Sercotel)', 'jauregui', 'https://www.booking.com/hotel/es/jauregui.html', 'https://hoteljauregui.com', 3, 'Hotel céntrico, 1.433 reviews, 8.7★. Tiene apartamentos en Airbnb pero no el hotel principal'),
  ('Hotel Jaizkibel', 'jaizkibel', 'https://www.booking.com/hotel/es/jaizkibel.html', null, 4, '4★, 849 reviews, 8.9★. Zona residencial cerca puerto'),
  ('Hotel Palacio Obispo', 'obispo', 'https://www.booking.com/hotel/es/obispo.html', 'https://hotelpalacioobispo.com', 3, 'Palacio s.XIV-XV en casco histórico. 1.403 reviews, 8.8★'),
  ('Parador de Hondarribia', 'parador-de-hondarribia', 'https://www.booking.com/hotel/es/parador-de-hondarribia.html', 'https://paradores.es/en/parador-de-hondarribia', 4, 'Castillo s.X, segmento techo de mercado. 853 reviews, 8.9★'),
  ('Villa Magalean Hotel & Spa', 'villa-magalaean-spa', 'https://www.booking.com/hotel/es/villa-magalaean-spa.html', 'https://www.villamagalean.com', 4, 'Boutique 8 habs + Spa. Explícitamente NO en Airbnb. 534 reviews, 9.6★')
on conflict (nombre) do update set
  booking_url = excluded.booking_url,
  web_propia = excluded.web_propia,
  estrellas = excluded.estrellas,
  notas = excluded.notas,
  actualizado_en = now();
