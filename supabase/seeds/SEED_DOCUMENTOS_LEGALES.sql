-- ============================================================================
-- Seed documentos legales base — Casa Mendilore (sesión 9 ext 5)
-- ============================================================================
-- Hashes SHA-256 calculados con Python hashlib.sha256(contenido.encode('utf-8')).hexdigest()
-- Para limpiar: DELETE FROM documentos_legales WHERE notas = 'Seed inicial sesión 9 ext 5';
-- ============================================================================

insert into public.documentos_legales (tipo, version, titulo, contenido, hash_sha256, vigente, notas) values
  ('politica_cancelacion', '2026-06-08-v1', 'Política de cancelación — Casa Mendilore', E'POLÍTICA DE CANCELACIÓN — CASA MENDILORE

1. CANCELACIONES POR PARTE DEL HUÉSPED

1.1 Cancelación gratuita: hasta 14 días antes de la fecha de entrada (check-in), el huésped puede cancelar sin coste alguno y se le reembolsará el 100% del importe abonado.

1.2 Cancelación con cargo del 50%: cancelaciones realizadas entre 13 y 7 días antes de la fecha de entrada conllevarán un cargo equivalente al 50% del importe total de la reserva.

1.3 Cancelación con cargo del 100%: cancelaciones realizadas con menos de 7 días de antelación o no presentación (no-show) conllevarán un cargo equivalente al 100% del importe total de la reserva.

2. CANCELACIONES POR PARTE DE CASA MENDILORE

2.1 Casa Mendilore se reserva el derecho de cancelar una reserva en caso de fuerza mayor (incendio, inundación, pandemia, restricciones administrativas, etc.), con devolución íntegra de las cantidades abonadas.

2.2 En caso de doble reserva o error técnico imputable a Casa Mendilore, se ofrecerá al huésped una habitación equivalente o, en su defecto, devolución íntegra más una compensación del 10%.

3. MODIFICACIONES

Las modificaciones de fechas, sujetas a disponibilidad, son gratuitas hasta 7 días antes del check-in. Posteriormente se tratan como cancelación + nueva reserva.

4. REEMBOLSOS

Los reembolsos se procesan al mismo método de pago utilizado en la reserva, en un plazo máximo de 14 días naturales desde la confirmación de la cancelación.

5. FUERZA MAYOR DEL HUÉSPED

En casos de fuerza mayor debidamente acreditados (enfermedad grave con justificante médico, fallecimiento de familiar de primer grado, restricciones gubernamentales) se valorará caso por caso ofrecer cambio de fechas sin coste.

Versión vigente: 2026-06-08-v1
Casa Mendilore — Jaitzubia Auzoa, 27, 20280 Hondarribia (Gipuzkoa)
NIF titular: 44550826X
', 'aaa331436d976507d73a091d715f79e4baaffc59d37f6952d14d0b8ab0602918', true, 'Seed inicial sesión 9 ext 5'),
  ('politica_mascotas', '2026-06-08-v1', 'Política de mascotas — Casa Mendilore', E'POLÍTICA DE MASCOTAS — CASA MENDILORE

PENDIENTE DE CONFIRMACIÓN POR EL TITULAR.

Marca temporal: Casa Mendilore actualmente NO admite mascotas en sus instalaciones, salvo perros de asistencia debidamente acreditados conforme a la legislación vigente.

Este documento será actualizado por el titular cuando se decida la política definitiva.

Versión vigente: 2026-06-08-v1 (provisional)
Casa Mendilore — Jaitzubia Auzoa, 27, 20280 Hondarribia (Gipuzkoa)
', '3cd947aa0123db72f929536a568056e56d90c83679704dedc984ff2b813b67d8', true, 'Seed inicial sesión 9 ext 5'),
  ('condiciones_particulares', '2026-06-08-v1', 'Condiciones particulares de la estancia — Casa Mendilore', E'CONDICIONES PARTICULARES DE LA ESTANCIA — CASA MENDILORE

1. HORARIOS

1.1 Check-in: a partir de las 16:00 h. Late check-in disponible bajo aviso previo.
1.2 Check-out: hasta las 12:00 h. Late check-out sujeto a disponibilidad con coste adicional.

2. CAPACIDAD Y USO

2.1 La capacidad máxima de cada habitación es la indicada en la confirmación de reserva. No se admite la pernoctación de personas adicionales no declaradas.
2.2 El espacio se contrata para uso residencial vacacional. Queda prohibido el uso para eventos, fiestas o cualquier actividad que altere el descanso de otros huéspedes.

3. NORMAS DE LA CASA

3.1 No fumar en interiores. Existen zonas exteriores habilitadas para fumadores.
3.2 Respeto del silencio nocturno entre las 23:00 y las 09:00.
3.3 No se admiten mascotas (ver política específica) salvo perros de asistencia.
3.4 Niños bienvenidos bajo supervisión de adultos responsables.

4. SERVICIOS INCLUIDOS

4.1 Desayuno incluido en el precio de la habitación.
4.2 Cena bajo reserva previa con un mínimo de 24 horas de antelación.
4.3 Wi-Fi gratuito en todas las zonas.
4.4 Aparcamiento gratuito en el recinto.

5. RESPONSABILIDAD POR DAÑOS

5.1 El huésped es responsable de los daños causados al mobiliario, instalaciones o equipamiento durante su estancia.
5.2 Casa Mendilore podrá retener la fianza o repercutir el coste de la reparación con justificación documental.

6. PROTECCIÓN DE DATOS

Los datos personales facilitados se tratan conforme a la Política de Privacidad publicada en mendilore.com, y para el cumplimiento de las obligaciones de registro de viajeros ante el Ministerio del Interior.

7. JURISDICCIÓN

Para cualquier controversia derivada de la estancia, las partes se someten a los Juzgados y Tribunales de Donostia – San Sebastián.

Versión vigente: 2026-06-08-v1
Casa Mendilore — Jaitzubia Auzoa, 27, 20280 Hondarribia (Gipuzkoa)
NIF titular: 44550826X
Tel: +34 655 745 530 · mendilore@mendilore.com
', 'dfd6d9fbc0195da9d9ac2c05f36ac803455412f32d2eb826135d37ef62b959d3', true, 'Seed inicial sesión 9 ext 5')
on conflict (tipo, version) do nothing;

-- Verificación
select tipo, version, length(contenido) as chars_contenido, substring(hash_sha256, 1, 16) as hash16, vigente, publicado_en::date
from public.documentos_legales
where notas = 'Seed inicial sesión 9 ext 5'
order by tipo;
