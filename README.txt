TMS - Final Cloudflare project

Contents:
- public/index.html : application UI
- public/config.js  : Supabase Project URL + public anon/publishable key
- src/index.ts      : Cloudflare Worker serving the static assets
- wrangler.jsonc    : Cloudflare Workers static assets configuration

The Supabase key in config.js is an anon/public client key. Do not replace it with a service_role/secret key.
