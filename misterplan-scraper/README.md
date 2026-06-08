# misterplan-scraper

Apify Actor que extrae reservas del intranet **TCloudV2 de MisterPlan** y las envía al webhook del panel Casa Mendilore para upsert idempotente en Supabase.

## Arquitectura

```
Apify Schedule (hourly 08-22h Madrid)
   ↓
Apify Actor misterplan-scraper (Puppeteer + Chromium)
   ↓ login → planning N meses → modal por reserva → parse
   ↓
POST https://panel.mendilore.com/api/webhook/misterplan
   ↓ x-misterplan-secret auth
   ↓
Supabase RPC public.upsert_reserva_misterplan(jsonb)
   ↓
public.reservas + public.huespedes (UPSERT por id_externo_misterplan)
```

## Estructura del repo

```
misterplan-scraper/
├── .actor/
│   ├── actor.json          ← Apify Actor metadata
│   └── input_schema.json   ← UI del input en Apify Console
├── Dockerfile              ← apify/actor-node-puppeteer-chrome:22 base
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── main.ts             ← orquestación (init → login → scrape → webhook)
    ├── login.ts            ← login + session persistence (cookies en KeyValueStore)
    ├── scrape-planning.ts  ← iteración meses + apertura de modales
    ├── parse-modal.ts      ← extracción por labels del detalle de reserva
    ├── webhook.ts          ← POST con retry exponencial
    ├── utils.ts            ← parseEuros, mapCanal, parseDateESP, etc (puras)
    ├── utils.test.ts       ← tests unitarios de utils
    └── types.ts            ← interfaces compartidas
```

## Cómo desplegar a Apify

### Opción A — desde GitHub (recomendada, hace builds automáticos en cada push)

1. Sube esta carpeta a un repo de GitHub (puede ser un subfolder dentro de mendilore-panel).
2. Apify Console → **Actors** → **+ Develop new** → **Import from GitHub**
3. URL del repo, branch `main`, path al folder `misterplan-scraper/`
4. Apify hace `docker build` y deja el actor listo.
5. **Build** → espera ~3 min al primer build (descarga dependencias).
6. **Versions** → marca el último build como "Latest version".

### Opción B — Apify CLI desde tu Mac

```bash
cd misterplan-scraper
npm install -g apify-cli
apify login
apify push
```

## Input

| Campo | Tipo | Por defecto | Notas |
|---|---|---|---|
| `username` | string (secret) | — | Usuario MisterPlan |
| `password` | string (secret) | — | Contraseña |
| `webhookUrl` | string | `https://panel.mendilore.com/api/webhook/misterplan` | |
| `webhookSecret` | string (secret) | — | Igual a `MISTERPLAN_WEBHOOK_SECRET` en CF |
| `monthsAhead` | int | 4 | Meses futuros a recorrer |
| `monthsBack` | int | 0 | Meses pasados (usa 12+ en el primer run para histórico) |
| `headless` | bool | true | Desactivar para debug local |
| `debug` | bool | false | Logs verbose + screenshots a KeyValueStore |

## Primer run — activación de dispositivo

MisterPlan tiene "device fingerprint": el primer login desde un navegador nuevo requiere clicar un link de activación en email.

**Procedimiento de activación (Goiko, 5 min, una vez):**

1. Ejecutar el actor en Apify con `headless: false` y `debug: true`
2. En el log verás `Device activation required`
3. Apify graba la sesión visualmente — abre el video del run
4. Mientras, abre el email mendilore@mendilore.com → busca email "Activar nuevo dispositivo MisterPlan" → click link
5. Vuelve a ejecutar el actor (ya activado, las cookies persisten en `KeyValueStore.misterplan-session`)

A partir de ese momento todos los runs siguientes funcionan sin intervención.

## Schedule recomendado

Apify Schedule cron: `0 8,10,12,14,16,18,20,22 * * *` (cada 2h durante el día Madrid)

- Cada run dura ~30-60 segundos (4 meses × ~20 reservas/mes × ~1s/modal)
- Coste Apify Free: $0.005/run × 8 runs/día × 30 días = **$1.20/mes** — dentro del Free $5
- Si necesitas más frecuencia: `0 * 8-22 * * *` (cada hora) ≈ $2.25/mes — sigue dentro del Free

## Output (al panel)

```json
{
  "source": "misterplan",
  "scrapedAt": "2026-06-08T18:30:00Z",
  "monthsScraped": 4,
  "reservas": [
    {
      "id_reserva": "1-7328706",
      "localizador_externo": "RuralCloud_V2",
      "canal": "web_propia",
      "habitacion": "nube",
      "fecha_in": "2026-06-04",
      "fecha_out": "2026-06-07",
      "noches": 3,
      "huesped_nombre": "Stefan",
      "huesped_apellidos": "Watson",
      "huesped_email": "...",
      "huesped_telefono": "+33...",
      "huesped_pais": "FR",
      "importe_total": 745.00,
      "importe_moneda": "EUR",
      "anticipo": 0,
      "pendiente_cobro": 0,
      "estado_reserva": "confirmada",
      "estado_cobro": "cobrado",
      "forma_pago": "transferencia",
      "factura_num": "143",
      "fecha_reserva": "2026-05-06T10:26:35Z",
      "observaciones": null,
      "num_huespedes": 2
    }
  ],
  "errors": [],
  "sessionRefreshed": false
}
```

## Tests

```bash
npm install
npx tsc
node --test dist/utils.test.js
```

Las funciones `utils.ts` son 100% puras y testeables sin browser. El resto (login, scrape, parse) se valida en el primer run de staging con `debug: true`.

## Robustez ante cambios de MisterPlan

El parser usa **labels textuales** (`Llegada`, `Salida`, `Importe`, etc.) en lugar de selectores CSS específicos. Si MisterPlan cambia la maquetación del modal (mueve filas, cambia clases), el parser sigue funcionando siempre que los labels permanezcan en el DOM.

Si el parser empieza a devolver `null` o campos vacíos:
1. Run con `debug: true` → recupera screenshots y `_raw.modalText` del Dataset Apify
2. Actualiza el array de labels en `parse-modal.ts` con las nuevas variantes
3. Re-push del actor

## Monitorización

El panel registra cada sync en `public.logs_actividad`:
- `misterplan_sync_ok` — todo OK, N reservas procesadas
- `misterplan_sync_parcial` — algunas reservas fallaron upsert
- `misterplan_scraping_errores` — errores durante el scraping (modal no abierto, etc.)

Query útil:
```sql
select ocurrido_en, evento, detalles->>'reservas_insertadas' as ins,
       detalles->>'reservas_actualizadas' as upd, detalles->>'errores_scraping' as scr_err
from public.logs_actividad
where evento like 'misterplan_%'
order by ocurrido_en desc
limit 30;
```

Apify Schedule envía email a info@apify.com si el actor falla. Para alertas a Casa Mendilore, configurar en el Schedule: **Notifications** → **Email** → añadir `info@mendilore.com` y `mendilore@mendilore.com` para `Run failed`.
