# Bot de Telegram — carga rápida

Edge Function que recibe mensajes de un bot de Telegram y carga **gastos, ingresos y
cuotas** en tu base de Supabase. Comandos simples, respuesta de confirmación, y
**solo responde a tu chat** (whitelist).

## Comandos

| Escribís | Carga |
|---|---|
| `nafta 8000` | Gasto $8.000, categoría "Nafta", mes actual |
| `12500 super compra del finde` | Gasto $12.500, categoría "Super", detalle "compra del finde" |
| `ingreso sueldo 500000` | Sueldo del mes = $500.000 |
| `ingreso otros 30000` | Otros ingresos del mes = $30.000 |
| `cuota heladera 15000 12` | Cuota "heladera", $15.000 × 12, desde el mes actual |
| `/id` | Te dice tu `chat_id` (para el setup) |
| `/help` | Ayuda |

Montos aceptados: `8000`, `8.000`, `12k`, `12mil`, `12500,50`.
La categoría se detecta matcheando una palabra contra tus categorías de la app.

---

## Setup (una sola vez)

### 1. Crear el bot en Telegram
1. Abrí Telegram y buscá **@BotFather**.
2. Mandale `/newbot`, elegí nombre y usuario. Te da un **token** tipo
   `123456:ABC-DEF...`. Guardalo → es `TELEGRAM_BOT_TOKEN`.

### 2. Instalar el Supabase CLI y linkear el proyecto
```bash
npm install -g supabase
```
```bash
supabase login
```
```bash
supabase link --project-ref TU_PROJECT_REF
```
> `TU_PROJECT_REF` es el que aparece en la URL de tu proyecto:
> `https://TU_PROJECT_REF.supabase.co` (Dashboard → Project Settings → General).

### 3. Conseguir tu `APP_USER_ID`
Dashboard → **Authentication → Users** → clic en tu usuario → copiá el **User UID**
(un UUID). Ese es `APP_USER_ID`.

### 4. Cargar los secretos
> `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` **ya los provee la plataforma solos**
> (no se pueden setear a mano, empiezan con `SUPABASE_`). Solo cargás estos:

```bash
supabase secrets set TELEGRAM_BOT_TOKEN="123456:ABC-DEF..." APP_USER_ID="tu-uuid" TELEGRAM_WEBHOOK_SECRET="una-cadena-larga-al-azar"
```

### 5. Desplegar la función
```bash
supabase functions deploy telegram-bot --no-verify-jwt
```
> `--no-verify-jwt` es necesario: Telegram no manda un JWT de Supabase. La seguridad
> la dan el `TELEGRAM_WEBHOOK_SECRET` + la whitelist de `chat_id`.

La función queda en:
`https://TU_PROJECT_REF.supabase.co/functions/v1/telegram-bot`

### 6. Registrar el webhook en Telegram
```bash
curl "https://api.telegram.org/botTU_BOT_TOKEN/setWebhook" -H "Content-Type: application/json" -d "{\"url\":\"https://TU_PROJECT_REF.supabase.co/functions/v1/telegram-bot\",\"secret_token\":\"una-cadena-larga-al-azar\"}"
```
(el `secret_token` debe ser **el mismo** que pusiste en `TELEGRAM_WEBHOOK_SECRET`).

### 7. Conseguir tu `chat_id` y cerrar la whitelist
1. Escribile al bot: `/id` → te responde tu `chat_id` (un número).
2. Cargá ese id como secreto y **redesplegá** para que tome el cambio:
```bash
supabase secrets set TELEGRAM_ALLOWED_CHAT_ID="123456789"
```
```bash
supabase functions deploy telegram-bot --no-verify-jwt
```

Listo. Probá mandando `nafta 8000` → deberías ver la confirmación y el gasto en la app.

---

## Notas
- Es **de un solo usuario**: la función carga todo para `APP_USER_ID`. Si algún día
  sumás usuarios, hay que mapear cada `chat_id` a su `user_id`.
- La función usa la **service_role key** (saltea RLS). Por eso la whitelist de
  `chat_id` y el `secret_token` no son opcionales en la práctica: sin eso, cualquiera
  que descubra la URL o el bot podría cargarte datos.
- Ver logs / debug: Dashboard → Edge Functions → `telegram-bot` → Logs, o
  `supabase functions logs telegram-bot`.
- Para cambiar el webhook o borrarlo: `.../deleteWebhook` o volvé a correr `setWebhook`.
```bash
curl "https://api.telegram.org/botTU_BOT_TOKEN/getWebhookInfo"
```
