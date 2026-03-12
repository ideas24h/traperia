# CLAUDE.md — Traperia

## Proyecto
**traperia.com** — Plataforma de vaciado de pisos con IA. Presupuesto instantáneo en 3 minutos.

## Stack
- **Frontend:** Next.js 14 + TypeScript + Tailwind + shadcn/ui
- **Backend:** Next.js API Routes + Supabase
- **IA:** OpenClaw Gateway (kimi-k2.5 para visión, glm-4.7 para texto)
- **Infra:** Vercel + Cloudflare + GitHub Actions

## OpenClaw Gateway
- URL local: `http://localhost:47821/v1`
- Token: ver `.env.local` → `OPENCLAW_TOKEN`
- Modelo visión: `kimi-k2.5`
- Modelo texto: `zai/glm-4.7`

## Agentes en ~/.openclaw/agents/
- `traperia-director` — Orchestrator (Claude Opus 4.6)
- `traperia-quoter` — Presupuestos IA (kimi-k2.5)
- `traperia-ops` — Operaciones (glm-4.7)
- `traperia-marketplace` — Marketplace (glm-4.7)
- `traperia-growth` — Crecimiento (claude-sonnet-4-6)
- `traperia-b2b` — Partners B2B (glm-4.7)

## Comandos de Desarrollo

```bash
npm run dev          # dev server en :3000
npm run test         # vitest
npm run test:e2e     # playwright
npm run lint         # eslint + tsc
npm run db:migrate   # supabase migrations
```

## Estructura del Proyecto

```
traperia/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── (marketing)/  # Landing, blog, SEO
│   │   ├── (app)/        # App autenticada
│   │   ├── api/          # API Routes
│   │   └── b2b/          # Dashboard partners
│   ├── components/       # UI components
│   ├── lib/              # Utilities, clients
│   │   ├── ai/           # OpenClaw integration
│   │   ├── supabase/     # DB client
│   │   └── pricing/      # Pricing engine
│   └── types/            # TypeScript types
├── agents/               # Agent definitions (symlink a ~/.openclaw/agents/traperia-*)
├── docs/                 # Documentación técnica
├── tests/
│   ├── unit/             # Vitest
│   └── e2e/              # Playwright
└── supabase/
    └── migrations/       # DB schema
```

## Convenciones

- **Commits:** `feat:`, `fix:`, `docs:`, `test:`, `refactor:`
- **Branches:** `feat/[feature]`, `fix/[bug]`, `agent/[nombre]`
- **Tests:** Todo endpoint de API tiene test unitario. Todo flujo crítico tiene test e2e.
- **Tipos:** TypeScript estricto, sin `any`.
- **Errores:** Siempre loguear con contexto suficiente para debug.

## Variables de Entorno (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENCLAW_TOKEN=e456b5ae3b5b64493c2a4cd4cb73fc39c4bb75de827ab062
OPENCLAW_URL=http://localhost:47821/v1
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
WHATSAPP_TOKEN=
TELEGRAM_BOT_TOKEN=
```

## Fase Actual: MVP — Mes 1

**Objetivo:** Landing + formulario + presupuesto IA funcionando.

**DOD (Definition of Done):**
- [ ] Usuario sube fotos → recibe presupuesto en <3 min
- [ ] Presupuesto enviado por WhatsApp automáticamente
- [ ] Admin puede ver todos los presupuestos en dashboard
- [ ] Tests unitarios para pricing engine
- [ ] Deploy en Vercel funcionando
