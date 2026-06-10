-- Migration 0010: actualizar aviso legal con código registro turístico XSS00159 (Gobierno Vasco)
-- Recibido de Juan el 10 jun 2026

DO $$
DECLARE
  nuevo_contenido text;
  nuevo_hash text;
  doc_id uuid;
BEGIN
  -- Obtener ID del documento aviso_legal (slug)
  SELECT id INTO doc_id FROM public.documentos_legales 
  WHERE slug = 'aviso_legal' OR titulo ILIKE '%aviso%legal%'
  LIMIT 1;

  IF doc_id IS NULL THEN
    -- Si no existe, lo creamos
    INSERT INTO public.documentos_legales (slug, titulo, contenido_md, hash_sha256, version, vigente)
    VALUES (
      'aviso_legal',
      'Aviso legal',
      '# Aviso legal — Casa Mendilore

## Identificación del prestador de servicios

**Titular:** Casa Mendilore  
**Dirección:** Hondarribia (Gipuzkoa), País Vasco, España  
**Código de Registro Turístico (Gobierno Vasco):** **XSS00159**  
**Email de contacto:** info@mendilore.com  
**Web:** https://www.mendilore.com

## Objeto

El presente aviso legal regula el uso del sitio web mendilore.com y los servicios de alojamiento turístico ofrecidos por Casa Mendilore, registrada oficialmente en el Registro de Empresas y Actividades Turísticas de Euskadi con el código **XSS00159**.

## Marco normativo aplicable

La actividad de Casa Mendilore se desarrolla conforme a:
- Ley 13/2016, de 28 de julio, de Turismo del País Vasco
- Decreto 191/2021, de 31 de agosto, de alojamientos turísticos
- Reglamento UE 2016/679 (RGPD) y Ley Orgánica 3/2018 de Protección de Datos
- Real Decreto 933/2021 sobre obligaciones de registro documental e información

## Reserva y cancelación

Las condiciones de reserva, fianza y cancelación se rigen por el documento "Condiciones de cancelación" vigente en el momento de la reserva, que el huésped acepta explícitamente con su firma digital.

## Propiedad intelectual

Los contenidos del sitio web (textos, imágenes, marca) son propiedad de Casa Mendilore o cuentan con la licencia correspondiente. Queda prohibida su reproducción sin autorización.

## Datos personales

El tratamiento de datos personales se rige por la Política de Privacidad de Casa Mendilore.

## Legislación aplicable y jurisdicción

Este aviso legal se rige por la legislación española. Para cualquier controversia, las partes se someten a los Juzgados y Tribunales de Hondarribia (Gipuzkoa).

---

**Versión 2 — 10 jun 2026** · Actualizado con código registro turístico XSS00159',
      encode(digest('XSS00159-' || now()::text, 'sha256'), 'hex'),
      2,
      true
    )
    RETURNING id INTO doc_id;
    RAISE NOTICE 'Documento aviso_legal creado con id %', doc_id;
  ELSE
    -- Actualizar marcando viejo como no vigente
    UPDATE public.documentos_legales SET vigente = false WHERE id = doc_id;
    
    -- Insertar nueva versión
    INSERT INTO public.documentos_legales (slug, titulo, contenido_md, hash_sha256, version, vigente)
    VALUES (
      'aviso_legal',
      'Aviso legal',
      '# Aviso legal — Casa Mendilore

## Identificación del prestador de servicios

**Titular:** Casa Mendilore  
**Dirección:** Hondarribia (Gipuzkoa), País Vasco, España  
**Código de Registro Turístico (Gobierno Vasco):** **XSS00159**  
**Email de contacto:** info@mendilore.com  
**Web:** https://www.mendilore.com

## Objeto

El presente aviso legal regula el uso del sitio web mendilore.com y los servicios de alojamiento turístico ofrecidos por Casa Mendilore, registrada oficialmente en el Registro de Empresas y Actividades Turísticas de Euskadi con el código **XSS00159**.

## Marco normativo aplicable

La actividad de Casa Mendilore se desarrolla conforme a:
- Ley 13/2016, de 28 de julio, de Turismo del País Vasco
- Decreto 191/2021, de 31 de agosto, de alojamientos turísticos
- Reglamento UE 2016/679 (RGPD) y Ley Orgánica 3/2018 de Protección de Datos
- Real Decreto 933/2021 sobre obligaciones de registro documental e información

## Reserva y cancelación

Las condiciones de reserva, fianza y cancelación se rigen por el documento "Condiciones de cancelación" vigente en el momento de la reserva, que el huésped acepta explícitamente con su firma digital.

## Propiedad intelectual

Los contenidos del sitio web (textos, imágenes, marca) son propiedad de Casa Mendilore o cuentan con la licencia correspondiente. Queda prohibida su reproducción sin autorización.

## Datos personales

El tratamiento de datos personales se rige por la Política de Privacidad de Casa Mendilore.

## Legislación aplicable y jurisdicción

Este aviso legal se rige por la legislación española. Para cualquier controversia, las partes se someten a los Juzgados y Tribunales de Hondarribia (Gipuzkoa).

---

**Versión 2 — 10 jun 2026** · Actualizado con código registro turístico XSS00159',
      encode(digest('XSS00159-' || now()::text, 'sha256'), 'hex'),
      2,
      true
    );
    RAISE NOTICE 'Aviso legal v2 insertado, v1 marcada no vigente';
  END IF;
END $$;
