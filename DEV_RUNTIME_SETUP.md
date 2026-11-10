# My Peptides — Local Development

Este documento descreve como rodar o backend existente localmente. Ele não
introduz arquitetura nova, não substitui nenhum módulo e não reproduz o
Render — só documenta e viabiliza o ambiente de desenvolvimento no seu
próprio computador.

## Pré-requisitos

- **Node.js** `>=22` (`engines.node` no `package.json` raiz e no pacote da API).
- **pnpm** `11.0.8` (`packageManager` no `package.json` raiz). Instale com
  `corepack enable && corepack prepare pnpm@11.0.8 --activate`, ou
  `npm install -g pnpm@11.0.8` se o seu Node não tiver `corepack` disponível.
- **Docker + Docker Compose**, apenas para subir o PostgreSQL local (não é
  usado para rodar a API em desenvolvimento).
- **Credenciais externas reais** para funcionalidade completa: `GEMINI_API_KEY`
  e `OPENAI_API_KEY` (opcionais — sem elas a API sobe normalmente, só o
  scan de foto por IA fica indisponível), e opcionalmente Google/Apple/
  Stripe/RevenueCat/VAPID conforme o que você for testar (ver seção
  Environment).

## Estrutura

```
my-peptides-api/
├── docker-compose.yml       ← Postgres local (só isso; ver "Arquitetura local")
├── scripts/dev-docker-stack.sh
├── packages/
│   ├── api/                 ← API NestJS (o produto inteiro, incluindo scan de foto)
│   └── scan-core/           ← Lib compartilhada (providers Gemini/OpenAI, análise de imagem)
```

`scan-core` não é um serviço — é uma biblioteca TypeScript, consumida
diretamente pela API (`workspace:*`) dentro de `modules/scan`. O scan de
foto roda dentro do mesmo processo Nest que todo o resto do produto: mesma
autenticação (JWT normal, sem token separado), mesmo banco, mesmo deploy.
Não existe mais um segundo serviço para isso — até 2026-09-28 havia um
`packages/scan-service` (Express, porta própria, autenticado por uma
assertion RS256 assinada pela API) rodando separado no Google Cloud Run;
foi retirado porque nunca chegou a funcionar de ponta a ponta em produção
e só adicionava uma segunda infraestrutura, um segundo par de chaves de IA
e um segundo trust boundary para manter sincronizados sem necessidade.

## Arquitetura local

```
API (NestJS, :3000)
   │
   ├──> PostgreSQL (Prisma)
   └──> modules/scan → Gemini (primário) → fallback OpenAI

PostgreSQL (Docker Compose local, :5434 no host)
```

Localmente, a API não roda dentro de container — só o Postgres roda via
Docker; a API roda como processo Node normal via `pnpm`.

## Portas

| Serviço | Porta local | Endpoint |
|---|---:|---|
| API NestJS | `3000` | `http://localhost:3000/api` |
| PostgreSQL (Docker) | `5434` no host → `5432` no container | `localhost:5434` |
| Frontend (futuro) | `5173` | só previsto como origem CORS, nada para iniciar aqui |

## Environment

```
packages/api/.env            ← copiar de packages/api/.env.example
```

```bash
cp packages/api/.env.example packages/api/.env
```

`packages/api/.env.example` é a documentação viva do schema Zod
(`packages/api/src/config/env.schema.ts`). O `.env` real é ignorado pelo
`.gitignore` da raiz (`.env`, `.env.*`, exceto `!.env.example`).

**Variáveis obrigatórias para a API iniciar:** `DATABASE_URL`,
`JWT_ACCESS_SECRET` (mín. 32 caracteres), `JWT_REFRESH_SECRET` (mín. 32
caracteres). Todo o resto (Google, Apple, Stripe, RevenueCat, VAPID, scan
de foto) é opcional/condicional — a API sobe sem eles, só a funcionalidade
correspondente fica indisponível.

**Scan de foto por IA (`GEMINI_API_KEY`/`OPENAI_API_KEY`):** as duas são
opcionais, mas só funcionam **juntas** — o schema Zod rejeita configurar
uma sem a outra (Gemini é o provedor primário, OpenAI é o fallback usado
quando o Gemini falha, expira ou está com o circuit breaker aberto). Sem
nenhuma das duas, a API sobe normalmente e os endpoints `/api/scans/*`
respondem 503 (`SCAN_NOT_CONFIGURED`) em vez de falhar o boot inteiro.

## Banco

O banco é PostgreSQL, usado pela API via Prisma (inclusive pelas tabelas
de scan — `scan_jobs`, `scan_usage`, `scan_feedback`, `scan_feedback_usage`
— que agora são modelos Prisma normais, com FK cascata para `User`).

**Como subir localmente:**

```bash
docker compose up -d
```

Isso sobe só o serviço `postgres` definido em `docker-compose.yml` (imagem
`postgres:16-alpine`, usuário/senha/banco `nutriscan`, porta `5434` no host).

**Como configurar `DATABASE_URL`:** o valor padrão em
`packages/api/.env.example` já corresponde ao Compose acima:

```
DATABASE_URL=postgresql://nutriscan:nutriscan@localhost:5434/nutriscan
```

**Como aplicar migrations:**

```bash
pnpm --filter @nutriscan/api exec prisma generate
pnpm --filter @nutriscan/api exec prisma migrate deploy
```

**Como executar seeds:**

| Comando | Arquivo | O que popula |
|---|---|---|
| `pnpm --filter @nutriscan/api db:seed` | `prisma/seeds/seed.ts` | Seed principal: usuário dev (`DEV_SEED_*`), usuário admin com comp premium (`ADMIN_SEED_*`, cai em defaults hardcoded no próprio script se não configurado — ver `.env.example`), achievements, catálogo de dieta (`diet-catalog.ts`), tabela TACO (`taco-data.ts`) e catálogo de treino (`workout-catalog.ts`) — **os três catálogos já vêm juntos neste seed**, não precisam de comando separado |
| `pnpm --filter @nutriscan/api db:seed:diet` | `prisma/seeds/seed-diet-catalog.ts` | Re-popula/atualiza só o catálogo de receitas de dieta (`diet-catalog.ts`), sem tocar em usuários/achievements. Útil para reaplicar o catálogo isoladamente. |
| `pnpm --filter @nutriscan/api db:seed:carnivore` | `prisma/seeds/seed-carnivore.ts` | Subconjunto do mesmo `diet-catalog.ts`, filtrado só para receitas com `dietTypes` incluindo `CARNIVORE`. Sobrepõe parcialmente `db:seed:diet`. |

Não há `db:seed:workout` nem script dedicado para `taco-data.ts` — ambos só
são aplicados como parte do seed principal (`seed.ts`). Isso não é um bug;
é assim que o script já estava escrito.

⚠️ **Observação de segurança:** `prisma/seeds/seed.ts` cria um usuário
admin com senha padrão hardcoded no próprio código-fonte
(`admin@calordiet.com` / `C@lorDiet123`) caso
`ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` não estejam definidos. Em
produção esse usuário só é criado se `SEED_ADMIN_USER=true` for setado
explicitamente, mas vale sempre definir `ADMIN_SEED_PASSWORD` localmente
para não depender do valor hardcoded.

## API

```bash
pnpm --filter @nutriscan/api dev
```

(equivalente a `nest start --watch`, com hot-reload)

- **Porta:** `3000` (`PORT` no `.env`, `packages/api/src/main.ts`).
- **Prefixo global:** `/api`.
- **Health check real:** `GET http://localhost:3000/api/health` (módulo
  `HealthModule`, usa `@nestjs/terminus`).
- **Swagger** (fora de produção, ou com `ENABLE_SWAGGER=true`):
  `http://localhost:3000/api/docs`.
- **Scan de foto:** `GET/POST http://localhost:3000/api/scans/*`
  (`modules/scan`), autenticado com o JWT normal (`JwtAuthGuard`) — sem
  configuração extra além de `GEMINI_API_KEY`/`OPENAI_API_KEY` no `.env`.

## Desenvolvimento completo (sequência do zero)

```bash
# 1. Instalar dependências (na raiz do monorepo)
pnpm install

# 2. Configurar environment
cp packages/api/.env.example packages/api/.env
# edite o .env: pelo menos JWT_ACCESS_SECRET e JWT_REFRESH_SECRET;
# GEMINI_API_KEY e OPENAI_API_KEY reais (as duas juntas) se for testar o scan de foto.

# 3. Subir o Postgres local
docker compose up -d

# 4. Aplicar migrations
pnpm --filter @nutriscan/api exec prisma generate
pnpm --filter @nutriscan/api exec prisma migrate deploy

# 5. Rodar seeds (opcional, recomendado)
pnpm --filter @nutriscan/api db:seed

# 6. Iniciar a API
pnpm --filter @nutriscan/api dev
# verificar: curl http://localhost:3000/api/health
```

Alternativa automatizada para os passos 1, 3, 4 e 5: `pnpm dev:docker`
(roda `scripts/dev-docker-stack.sh`).

## O que continua fora do alcance de um `git clone` + `.env.example`

- Login Google/Apple real, Stripe, RevenueCat e Web Push exigem credenciais
  de terceiros que não podem ser inventadas aqui.
- O scan de foto por IA não responde sem `GEMINI_API_KEY`/`OPENAI_API_KEY`
  reais (as duas juntas) — sem elas, a API sobe normalmente e só os
  endpoints `/api/scans/*` ficam indisponíveis (503).
