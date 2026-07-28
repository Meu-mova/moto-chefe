// Uso: TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node scripts/set-telegram-webhook.mjs
// Remover:  ... node scripts/set-telegram-webhook.mjs --delete
const token = process.env.TELEGRAM_BOT_TOKEN
const segredo = process.env.TELEGRAM_WEBHOOK_SECRET
const url = 'https://mova.motochefesuldeminas.com.br/api/telegram/webhook'
if (!token) { console.error('faltou TELEGRAM_BOT_TOKEN'); process.exit(1) }

const base = `https://api.telegram.org/bot${token}`
const r = process.argv.includes('--delete')
  ? await fetch(`${base}/deleteWebhook`, { method: 'POST' })
  : await fetch(`${base}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, secret_token: segredo, allowed_updates: ['message', 'callback_query'] }),
    })
console.log(await r.json())
