# PROJECT BACKEND AUDIT

## Relatório final de auditoria técnica — My Peptides: GLP-1 Tracker

**Data da auditoria:** 8 de setembro de 2026  
**Escopo:** backend existente extraído de `my-peptides-backend-6557432.zip`, incluindo API NestJS, pacote `scan-service`, pacote `scan-core`, Prisma, PostgreSQL, migrations, configurações, deploy, documentação e testes.  
**Princípio aplicado:** o código existente foi tratado como fonte principal de verdade. Nenhum código de produção, configuração ou migration foi reescrito, compactado ou apagado nesta etapa.

## Resumo executivo

O projeto é um monorepo TypeScript com três componentes principais: uma API NestJS, um `scan-service` Express separado e um `scan-core` compartilhado para processamento de imagens e integração com modelos de IA. O backend não é um esqueleto vazio: contém autenticação, onboarding, perfil, metas, nutrição, refeições, água, peso, exercícios, gamificação, GLP-1, medicamentos, notificações, billing, referrals, sincronização offline, jobs e infraestrutura de scanner.

A arquitetura mais madura é a de sincronização offline. Ela possui mutações idempotentes, journal transacional, revisão global PostgreSQL, bootstrap paginado, dependências entre operações, conflitos explícitos, retenção e compatibilidade com fluxos legados. O scanner também tem uma arquitetura real, com upload multipart, assertions RS256, quotas, leases, idempotência, fallback Gemini/OpenAI, validação de imagem e feedback.

A validação executável final foi positiva quando executada com os comandos corrigidos:

| Verificação | Resultado |
|---|---|
| Typecheck do monorepo | **PASS** |
| Lint do monorepo | **PASS** |
| `prisma validate` | **PASS**, usando apenas uma `DATABASE_URL` sintética para validação de schema |
| `prisma generate` | **PASS** |
| Testes da API | **61 suítes, 468 testes — PASS** |
| Testes do `scan-core` | **4 suítes, 14 testes — PASS** |
| Testes do `scan-service` | **7 suítes, 46 testes — PASS; 1 suíte/2 testes pulados** |
| Build do monorepo | **PASS** |

A suíte pulada é a integração PostgreSQL dos repositórios do `scan-service`, que depende de banco/configuração de integração. Portanto, os testes unitários, contratos HTTP, serviços e build estão verdes, mas ainda falta validar completamente as queries e transações contra PostgreSQL real.

### Estado executivo por domínio

| Domínio | Estado | Evidência principal |
|---|---|---|
| API NestJS | **PRONTO para validação de runtime** | Build, typecheck, lint e testes passam |
| Autenticação JWT/refresh/OAuth | **PRONTO, dependente de configuração externa** | Guards, services, Apple/Google e testes |
| PostgreSQL/Prisma | **PRONTO no schema, dependente de banco** | 52 migrations, schema válido e generate passa |
| Nutrição/refeições | **PRONTO/PARCIAL** | Services, DTOs, meals, food items e scanner integrado ao fluxo de salvar |
| Scanner | **PRONTO/PARCIAL, dependente de terceiros** | `scan-service`, Gemini, OpenAI, PostgreSQL e assertions |
| GLP-1 | **PRONTO/PARCIAL** | Tratamentos, doses, sintomas, consentimentos, calendário e testes; depende de configuração clínica/operacional |
| Sync/offline | **PRONTO na implementação, dependente de operação/scheduler** | Push, bootstrap, changes, handlers, journal e retenção |
| Billing/RevenueCat | **PRONTO/PARCIAL, dependente de RevenueCat** | Webhooks, entitlement, produtos e cleanup |
| Notificações | **PARCIAL, dependente de Web Push e scheduler** | Preferências, reminders, push e jobs |
| Jobs assíncronos | **PRONTO na implementação, dependente de processo persistente** | Scheduler, cleanup, reminders, summaries e manutenção |
| Observabilidade | **PARCIAL** | Pino/Nest logging; Sentry não encontrado |
| E2E/integração real | **INCOMPLETO** | Integração PostgreSQL pulada; E2E completo não identificado |

## Classificação de severidade

### CRÍTICO

Não foi identificado, no código analisado, um segredo de produção inequívoco ou uma vulnerabilidade crítica confirmada. Isso não significa que o deployment esteja seguro sem configuração correta: vazamento ou má configuração de qualquer chave JWT, Apple, RevenueCat, IA ou banco teria impacto crítico.

### ALTO

| ID | Problema | Impacto |
|---|---|---|
| A-01 | A suíte de integração PostgreSQL do `scan-service` está pulada | Queries, foreign keys, leases, quotas e transações reais não estão completamente verificados |
| A-02 | Não foi identificado E2E completo da API com banco e autenticação reais | Fluxos combinados podem falhar apesar de testes unitários passarem |
| A-03 | O `scan-service` não possui rate limiter HTTP geral próprio | Criação de scans, access, cancel e feedback dependem de quotas de domínio ou gateway externo para anti-abuso de rede |
| A-04 | `trust proxy=1` e parsing de `x-forwarded-for` dependem da topologia real | Configuração incorreta pode permitir manipulação da identidade IP usada no rate limiting |
| A-05 | Integrações críticas dependem de secrets e provedores externos não disponíveis no ZIP | Login social, billing, IA, push e cleanup não podem ser considerados operacionais apenas por compilarem |

### MÉDIO

| ID | Problema | Impacto |
|---|---|---|
| M-01 | Overrides `RATE_LIMIT_*` são lidos diretamente de `process.env`, fora do schema principal | Configuração operacional não validada em startup |
| M-02 | `JWT_REFRESH_EXPIRATION` aceita string sem o mesmo teto explícito do access token | Risco de configuração de sessão excessivamente longa |
| M-03 | Swagger fica habilitado por padrão fora de produção | Pode expor contratos e superfície operacional em ambientes públicos não classificados como produção |
| M-04 | Não há Sentry nem APM externo confirmado | Falhas podem depender apenas de logs locais/Pino |
| M-05 | Testes de provedores são unitários/fakes; não há testes de rede contra Google, Apple, RevenueCat, Gemini ou OpenAI | Drift de API, credencial e configuração pode escapar |
| M-06 | Fixtures contêm strings com aparência de credencial | Baixo risco operacional, mas risco de higiene e cópia acidental |
| M-07 | O filtro de erros pode devolver `details`, `errors` e `path` de exceções HTTP customizadas | Requer disciplina para não expor dados clínicos, tokens ou objetos internos |
| M-08 | O scheduler é processo em memória e depende de `BACKGROUND_JOBS_ENABLED` | Jobs podem não executar se o processo não permanecer ativo ou se a flag for desativada |

### BAIXO

| ID | Problema | Impacto |
|---|---|---|
| B-01 | Aviso de depreciação de `package.json#prisma` em Prisma 6.19.3 | Migração futura para `prisma.config.ts` será necessária antes do Prisma 7 |
| B-02 | Não há relatório de cobertura de linhas/branches no resultado padrão | A quantidade de testes não mede cobertura real |
| B-03 | Não foi encontrada integração com Sentry, S3/object storage ou storage persistente de imagem | Pode ser intencional; deve ser documentado operacionalmente |
| B-04 | A primeira execução de testes com argumento duplicado falhou por comando inválido | A segunda execução correta passou; não é defeito do backend |

# 1. Visão geral do backend

O projeto é um monorepo privado chamado `nutriscan-ai`, versão `0.1.0`, com package manager pnpm e orquestração Turbo. O componente principal é uma API REST NestJS com prefixo global `/api`. O `scan-service` é uma aplicação Express separada, autenticada por assertions emitidas pela API principal. O `scan-core` contém processamento de imagem, prompts, schemas, providers e serialização compartilhados pelo serviço de scan.

A arquitetura persistente é PostgreSQL via Prisma na API e `pg` no scan-service. O banco contém domínio de produto, autenticação, billing, dados clínicos GLP-1, nutrição, treino, gamificação, sincronização, rate limiting e runtime de scan.

# 2. Stack e versões

As versões confirmadas diretamente nos manifests e lockfile são:

| Tecnologia | Versão declarada/resolvida | Uso |
|---|---|---|
| Node.js | `>=22` | Runtime dos pacotes |
| pnpm | `11.0.8` no root | Workspace/package manager |
| TypeScript | `5.9.3` | Linguagem e compilação |
| NestJS | `11.x` | API principal |
| Express | `5.2.1` no scan-service; Nest adapter na API | HTTP |
| Prisma CLI/client | `6.19.3` observado na validação; package declara `^6.9.0` | ORM, schema e migrations |
| PostgreSQL | Confirmado pelo provider Prisma e SQL migrations | Banco principal/runtime |
| Jest | `30.0.0` | Testes |
| ts-jest | `29.4.0` | Execução TypeScript em Jest |
| Turbo | `2.5.8` | Orquestração |
| `class-validator` | `0.14.2` | DTO validation Nest |
| `class-transformer` | `0.5.1` | Transformação de DTO |
| Zod | `3.25.17` | Configuração, scan-service e schemas |
| Passport | `0.7.0` | Autenticação/OAuth |
| `passport-google-oauth20` | `2.0.0` | Google OAuth |
| `google-auth-library` | `10.6.2` | Verificação Google |
| `jsonwebtoken` | `9.0.3` no scan-service | Assertions |
| `bcrypt` | package da API | Hash de senhas |
| `sharp` | `0.35.0` | Processamento seguro de imagens |
| `@google/genai` | `1.52.0` | Gemini |
| `openai` | `6.36.0` | OpenAI/fallback |
| `multer` | `2.2.0` | Upload multipart |
| `web-push` | `3.6.7` | Notificações push |
| Pino/Nest Pino | `pino 10.3.1`, `nestjs-pino 4.6.1` | Logging |

O banco exige `DATABASE_URL`; o Docker Compose e scripts de deployment fornecem o caminho operacional, mas a auditoria não inicia serviços externos reais.

# 3. Estrutura de módulos

## API principal

| Módulo | Responsabilidade | Componentes principais | Estado |
|---|---|---|---|
| `auth` | Cadastro, login, refresh, logout, guest, Google, Apple, OAuth | `AuthController`, `AuthService`, guards, strategies, DTOs | **PRONTO/configurável** |
| `users` | Perfil, body data, exclusão de conta | `UsersController`, services, account deletion guard | **PRONTO** |
| `onboarding` | Submissões, acknowledgements, conclusão | controller/service/DTOs | **PRONTO** |
| `goals` | Metas e cálculo nutricional | controllers/services/serializers | **PRONTO/PARCIAL** |
| `daily-log` | Água, peso, diário e compatibilidade legada | service/serializers | **PRONTO** |
| `meals` | Refeições, alimentos, itens, scanner-to-meal | controller/service/DTOs | **PRONTO/PARCIAL** |
| `diet` | Diet profile, receitas, planos e progresso | services/controllers | **PRONTO/PARCIAL** |
| `analytics` | Resumos e métricas | service/controllers/jobs | **PRONTO/PARCIAL** |
| `streaks` | Streaks e serialização | service/serializers | **PRONTO/PARCIAL** |
| `achievements` | Definições e unlocks | service/controller | **PRONTO** |
| `gamification` | Pontos, badges e perfil | service/controller | **PRONTO/PARCIAL** |
| `workout` | Perfis, planos, exercícios, sessões | controller/service/DTOs | **PRONTO/PARCIAL** |
| `glp1` | Consent, treatment, dose, symptoms, reminders, sites | controller/service/DTOs | **PRONTO/PARCIAL** |
| `medications` | Medicamentos e logs | controller/service/DTOs | **PRONTO/PARCIAL** |
| `notification-preferences` | Preferências sincronizáveis | controller/service/serializers | **PRONTO** |
| `billing` | RevenueCat, entitlement, subscriptions | controller/services/webhook | **PRONTO/dependente** |
| `referrals` | Referral codes e relações | controllers/service | **PARCIAL** |
| `sync` | Protocolo offline e journal | controller/service/handlers/maintenance | **PRONTO/dependente de scheduler** |
| `scan-auth` | Assertions para scan-service | controller/service | **PRONTO/dependente de scan-service** |
| `jobs` | Reminders, summaries, push, cleanup, sync maintenance | scheduler/processors | **PRONTO/dependente de processo** |
| `load-test` | Fluxo controlado de carga | service/guard/config | **ESTRUTURA OPERACIONAL CONTROLADA** |
| `common` | Guards, pipes, filters, CORS, rate limit, serializers | componentes globais | **PRONTO** |
| `prisma` | PrismaService e acesso ao banco | service/module | **PRONTO/configurável** |

## Componentes de scan

- `scan-core`: constants, errors, image processor, prompt, providers Gemini/OpenAI, response schema, analyzer, security e serializer.
- `scan-service/domain`: access, account deletion, assertion identity, contracts, identifiers, scan application service.
- `scan-service/http`: Express app, auth middleware, upload, routes e error handler.
- `scan-service/adapters`: PostgreSQL repositories, Gemini/OpenAI adapters, RevenueCat e cleanup.

# 4. Mapa completo da API

A API principal possui **111 endpoints extraídos dos controllers reais**. O prefixo global efetivo é `/api`; portanto, as rotas abaixo são apresentadas sem o prefixo global, como aparecem nos controllers.

A tabela completa endpoint-a-endpoint está no **Apêndice A** deste documento. Ela contém método, rota, controller, finalidade, autenticação, parâmetros, DTO/body, resposta, service e tabelas envolvidas.

Os grupos confirmados são:

| Grupo | Conteúdo |
|---|---|
| Auth | cadastro, login, refresh, logout, guest, Google, Apple, OAuth callback/codes |
| Onboarding | status, submissão, conclusão e acknowledgements |
| Users | perfil, body-data e exclusão |
| Goals/Diet | metas, TDEE, dieta e planos |
| Daily log | água, peso, histórico e exclusões |
| Meals | alimentos, refeições, scan/meal e serializers |
| Analytics | resumos e séries |
| Streaks/Achievements/Gamification | estado, unlocks, pontos e badges |
| Workout | profile, plan, swap e sessions |
| GLP-1 | consent, setup, treatment, doses, symptoms, reminders e injection sites |
| Medications | consent, medication e logs |
| Notifications | preferências e migrações |
| Billing | access, RevenueCat events/webhook e entitlement |
| Referrals | código, convite e status |
| Scan auth | emissão de assertion curta |
| Sync | push, changes e bootstrap |
| Load test | operações protegidas de teste |

Os códigos e respostas não declarados explicitamente nos controllers dependem do filtro Nest padrão e dos services; os casos específicos estão registrados no catálogo completo.

# 5. Autenticação

A API usa access JWT e refresh tokens persistidos. Access tokens são validados por guard/strategy; refresh tokens são rotacionados/revogados conforme estado da sessão e família. A configuração exige `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` com pelo menos 32 caracteres.

O access token tem duração positiva limitada a 30 dias, default de 15 minutos. O refresh token tem default de 7 dias; recomenda-se adicionar teto explícito ao schema para evitar configuração acidentalmente longa.

Há suporte confirmado para:

- cadastro e login por email/senha;
- guest session/installation;
- refresh e logout;
- Google OAuth/web/mobile IDs;
- Apple mobile/server-side exchange e revogação;
- authorization code com uso único;
- state e PKCE onde aplicável;
- guards JWT e account deletion;
- expiração, revogação e exclusão de conta.

A autenticação do scan-service é separada: a API assina assertions RS256 de curta duração contendo issuer, audience, subject, JTI, instalação, account generation e entitlement. O scan-service valida assinatura, claims, expiração, replay e geração de conta.

# 6. Banco de dados

O banco é PostgreSQL e o schema Prisma contém aproximadamente 52 migrations e dezenas de modelos. As áreas principais são:

- `users`, refresh/OAuth, Apple credentials e consents;
- goals, daily logs, water/weight;
- meals, meal items, food items, recipes, diet profiles/plans;
- workout profiles/plans/templates/sessions;
- achievements, streaks, gamification, points e badges;
- medications;
- GLP-1 consent, treatments, dose periods/events, symptoms, reminder rules, injection site states e setup submissions;
- notification preferences e weekly summaries;
- billing subjects/subscriptions/entitlements/trials/webhooks;
- referrals;
- `SyncMutation`, `SyncChange`, `SyncState`, `SyncBootstrapSession`;
- rate-limit buckets;
- scan runtime jobs, usage, reservations, feedback, replay e cleanup.

O schema possui campos obrigatórios/opcionais, timestamps, foreign keys, índices, unique constraints, enums e checks SQL documentados nas auditorias anteriores. `prisma validate` e `prisma generate` passaram na validação final.

# 7. Histórico das migrations

O histórico contém 52 migrations na ordem versionada. A evolução geral é:

1. fundação de usuários, autenticação e perfil;
2. metas, logs diários, água, peso, refeições e alimentos;
3. dieta, treino, streaks, achievements e gamificação;
4. medicamentos e primeiro domínio GLP-1;
5. tratamentos, doses, sintomas, calendários, consentimentos e sites de aplicação;
6. notificações, reminders e summaries;
7. billing, RevenueCat, entitlement e migrações de modelos comerciais;
8. referrals e dados de produto;
9. fundação de sync, mutations, changes e bootstrap;
10. revisão global e trigger PostgreSQL do journal;
11. runtime de scan, quotas, jobs, leases, feedback e account cleanup;
12. remoção/ajuste de componentes legados e evolução de retenção.

A migration do sync criou o journal e depois substituiu a sequence inicial por `sync_state` singleton e trigger `allocate_sync_revision`. A migration do scan criou `scan_jobs`, usage, reservations, feedback, assertion replays, cleanup receipts e account states com checks e foreign keys.

**Nenhuma migration foi apagada, compactada ou alterada.**

# 8. Funcionalidades

| Funcionalidade | Classificação | Motivo |
|---|---|---|
| Usuários/onboarding | **PRONTO** | Controllers, services, DTOs, estado e testes |
| Perfil/metas | **PRONTO/PARCIAL** | CRUD e cálculo existem; dependem de dados/fluxos de produto |
| Peso/água | **PRONTO** | Endpoints, handlers legados/canônicos, journal e testes |
| Dieta/nutrição | **PRONTO/PARCIAL** | Modelos, cálculo, diet profile e planos existem |
| Refeições/alimentos | **PRONTO/PARCIAL** | Persistência e validação existem; scanner/food provider depende de terceiros |
| Scanner | **PRONTO/PARCIAL/TERCEIROS** | Serviço real existe, IA e banco externo são necessários |
| Analytics | **PRONTO/PARCIAL** | Services/jobs existem; cobertura operacional integrada ainda limitada |
| Streaks/achievements | **PRONTO** | Efeitos transacionais e definições existem |
| Gamificação | **PRONTO/PARCIAL** | Pontos/badges/profile existem; regras devem ser exercitadas end-to-end |
| Exercícios/treinos | **PRONTO/PARCIAL** | Planos, templates, sessões e swap existem |
| GLP-1 | **PRONTO/PARCIAL** | Domínio amplo e testado; depende de configuração clínica e UX cliente |
| Medicamentos | **PRONTO/PARCIAL** | Models/services/logs existem |
| Tratamentos/doses/calendário | **PRONTO/PARCIAL** | Eventos, status, reminder rules e schedules existem |
| Sintomas/sites | **PRONTO/PARCIAL** | Eventos, severidade, consentimento e site state existem |
| Notificações/reminders | **PRONTO/PARCIAL/TERCEIROS** | Push e scheduler dependem de VAPID e processo persistente |
| Billing/RevenueCat | **PRONTO/PARCIAL/TERCEIROS** | Webhooks e entitlement existem; provedor e secrets necessários |
| Referrals | **PARCIAL** | Modelos e services existem, mas exigem validação completa de fluxo |
| Sync/offline | **PRONTO/OPERACIONAL** | Protocolo implementado; retention/scheduler e cliente são necessários |

# 9. GLP-1

O domínio GLP-1 possui:

- consentimento e escopos clínicos;
- setup submission;
- tratamentos e transições de status;
- dose plan periods;
- dose events com status scheduled/taken/missed/skipped/cancelled;
- rotas subcutaneous/oral;
- injection site code, dor e notas;
- sintomas com severidade, duração, endedAt e relação com dose;
- safety content version e acknowledgement;
- reminder rules;
- injection site state;
- sync operations para doses e sintomas;
- validações de tratamento, consentimento e consistência.

A implementação é substancial e possui testes de service, DTOs, schedules e sync handlers. Ela deve ser classificada como **implementada, porém parcial em relação a uma operação clínica completa**, pois segurança clínica, conteúdo atualizado, consentimento legal, timezone do cliente e integração com profissionais não podem ser inferidos apenas do código.

# 10. Nutrição e scanner

A nutrição possui food items, meals, meal items, receitas, diet profiles, planos e cálculos de macros/TDEE. O scan-service recebe multipart em `POST /v1/scans`, com máximo de 5 MiB, um arquivo, zero campos extras, tipos JPEG/PNG/WebP/HEIF e limites de pixels/dimensão via `sharp`.

O scan-core normaliza a imagem, calcula hash, cria prompt, chama Gemini como provedor configurado e OpenAI como provedor/fallback conforme wiring/configuração, valida a resposta e limita o resultado a 50 itens. O scan-service mantém job, status, lease, provider, image hash, result e errors.

O upload não é feito na API Nest principal; é feito no Express `scan-service`, autenticado por assertion emitida pela API. Não há object storage próprio confirmado: a imagem fica em memória durante o processamento e o banco armazena metadados/resultados/feedback.

O scanner é **implementado e dependente de terceiros**. Sem chaves Gemini/OpenAI, PostgreSQL do runtime e assertions compatíveis, não é operacional.

# 11. Sincronização/offline

O protocolo usa `SyncMutation`, `SyncChange`, `SyncState`, `SyncBootstrapSession` e handlers allowlisted para:

- água;
- peso;
- refeição;
- início/finalização de treino;
- dose GLP-1;
- sintoma GLP-1;
- preferências de notificação.

Limites principais: 20 mutations por lote, 256 KiB, 200 changes por página, 90 dias de journal, 400 dias de mutations, bootstrap de 15 minutos, dependências máximas de 10 e evento máximo de 365 dias.

Idempotência é garantida por `(userId, mutationId)`, hash de request e `(userId, installationId, sequence)`. O journal é escrito na mesma transação de domínio. O trigger PostgreSQL aloca revisão global. Cursors antigos abaixo do `retentionFloor` causam `BOOTSTRAP_REQUIRED`.

Conflitos incluem mutation ID reutilizado, sequência reutilizada, dependência rejeitada, dependency pending, baseVersion inválida, entidade divergente e conflitos específicos por domínio. Não há merge genérico last-write-wins.

O sync está **implementado**, mas depende de scheduler para retenção e de implementação correta no cliente offline.

# 12. Billing/RevenueCat

O módulo billing possui BillingSubject, BillingSubscription, PremiumEntitlement, PremiumTrialUse e RevenueCatWebhookEvent. A integração inclui:

- server API key;
- webhook authorization;
- HMAC signing secret;
- produtos mensal/anual;
- entitlement premium;
- sincronização de eventos;
- acesso comped;
- deleção de subscriber no cleanup;
- mapeamento de estados trialing/active/past_due/expired e eventos.

Os testes cobrem assinatura HMAC, mapeamento, acesso, produtos, deleção e migração. O billing é **implementado, dependente do RevenueCat e de configuração correta**. Não foi executado webhook real.

# 13. Notificações

O backend possui NotificationPreference sincronizável, PushService, ReminderProcessor, lembretes horários, risco de streak, reminders de dose/atividade e weekly summaries.

A entrega push usa Web Push/VAPID quando configurada. O scheduler roda a cada minuto e dispara tarefas por horário UTC. A funcionalidade está **parcialmente pronta operacionalmente** porque requer VAPID válido, processo persistente, configuração de jobs e integração correta do cliente.

# 14. Jobs e processamento assíncrono

`JobsSchedulerService` executa ticks e coordena:

- Scan account cleanup;
- Sync maintenance;
- reminders horários;
- streak check diário;
- weekly summary;
- push.

Há controle de reentrância, chaves de execução já concluída, leases no cleanup e logs. O cleanup externo possui outbox/tabela de tasks, retries, lease token, expiração, backoff, recibos e tratamento de falhas.

O risco operacional é que o scheduler é um processo em memória: precisa estar sempre ativo, não pode ser desligado em produção quando cleanup é necessário e deve ser executado com observabilidade e política de restart.

# 15. Segurança

Controles confirmados:

- secrets validados por Zod;
- JWT secrets mínimos de 32 caracteres;
- access token limitado a 30 dias;
- assertions RS256 com TTL máximo de 5 minutos;
- audience separada para deleção;
- CORS exato em produção e wildcard proibido;
- headers HSTS, CSP, frame deny, nosniff, referrer e cache control;
- `x-powered-by` desativado;
- `ValidationPipe` whitelist/forbid/transform;
- bloqueio de prototype pollution keys;
- body limit 300 KB na API e 16 KB no scan-service JSON;
- upload de imagem limitado e processado com `sharp`;
- ownership e account generation;
- rate limiting PostgreSQL;
- filtro global de erros sem stack para cliente;
- serializers evitando objetos Prisma crus;
- redaction testada;
- webhook RevenueCat autenticado e assinado.

Pontos a resolver: rate limit HTTP geral no scan-service, topologia de proxy, teto de refresh expiration, formalização de overrides de rate limit, E2E e integração real.

# 16. Variáveis de ambiente

A API e o scan-service utilizam variáveis para runtime, banco, JWT, Google, Apple, scan assertions, Scan Cloud, load test, rate limit, jobs, RevenueCat, VAPID, Gemini e OpenAI. A lista completa com finalidade e classificação, sem valores, está consolidada na auditoria de segurança anterior.

Variáveis críticas incluem:

- `DATABASE_URL`;
- `JWT_ACCESS_SECRET`;
- `JWT_REFRESH_SECRET`;
- `GOOGLE_CLIENT_SECRET`;
- `APPLE_PRIVATE_KEY_BASE64`;
- `APPLE_TOKEN_ENCRYPTION_KEY_BASE64`;
- `SCAN_ASSERTION_PRIVATE_KEY` ou arquivo equivalente;
- `REVENUECAT_SECRET_API_KEY`;
- `REVENUECAT_WEBHOOK_SIGNING_SECRET`;
- `VAPID_PRIVATE_KEY`;
- `GEMINI_API_KEY`;
- `OPENAI_API_KEY`.

Nenhum valor secreto é reproduzido neste relatório.

# 17. Testes

A execução correta produziu:

| Pacote | Suítes passadas | Testes passados | Observação |
|---|---:|---:|---|
| API | 61 | 468 | Services, DTOs, guards, auth, billing, sync, segurança e domínios |
| scan-core | 4 | 14 | imagem, segurança, analyzer e OpenAI provider |
| scan-service | 7 | 46 | HTTP, application service, assertions, access, cleanup, config, RevenueCat |
| Total | 72 suítes aprovadas | 528 testes aprovados | 1 suíte/2 testes de integração pulados |

Cobertura unitária é forte. Há testes de contrato HTTP e integração PostgreSQL preparada, mas não executada. Não foi identificado E2E completo da API principal nem teste real contra Google, Apple, RevenueCat, Gemini ou OpenAI.

# 18. Dependências externas

| Serviço | Uso | Estado |
|---|---|---|
| PostgreSQL | Persistência API, sync e scan runtime | Obrigatório |
| Google OAuth | Login/social | Configurável |
| Apple | Login, troca/revogação de token | Configurável |
| RevenueCat | Billing, entitlement, webhook, deleção | Configurável/obrigatório em produção conforme schema |
| Scan Cloud | Cleanup externo de conta | Configurável |
| Google Gemini | Scan IA primário/configurável | Secreto e quota externos |
| OpenAI | Scan IA/fallback configurável | Secreto e quota externos |
| Web Push | Notificações | VAPID necessário |
| Sentry | Não encontrado | Ausente |
| S3/object storage | Não encontrado | Ausente |

# 19. Problemas encontrados

O conjunto completo e priorizado está no início deste documento. Em termos de recuperação, os problemas mais importantes não são ausência de domínio, mas operação e validação de fronteiras:

1. integração PostgreSQL de scan pulada;
2. ausência de E2E completo;
3. dependência de secrets e serviços externos;
4. rate limit do scan-service dependente de domínio/gateway;
5. proxy/trusted IP precisa ser confirmado;
6. scheduler precisa ser mantido ativo;
7. refresh TTL e overrides de rate limit precisam ser endurecidos;
8. observabilidade externa não está configurada.

# 20. Estado atual do projeto

O projeto está em estado de **backend existente e compilável**, não de backend abandonado sem implementação. O estado atual é:

- **Build:** pronto;
- **TypeScript:** pronto;
- **Lint:** pronto;
- **Prisma schema/generate:** pronto;
- **Migrations:** presentes e preservadas;
- **Testes unitários/contratos:** verdes;
- **API de domínio:** amplamente implementada;
- **GLP-1:** implementado com regras extensas, parcial do ponto de vista clínico/operacional;
- **Scanner:** implementado no pacote separado, dependente de IA, banco e assertions;
- **Sync/offline:** implementado, dependente de cliente e scheduler;
- **Billing:** implementado, dependente do RevenueCat;
- **Notificações:** implementadas, dependentes de VAPID e jobs;
- **Integração real/E2E:** incompleta;
- **Produção:** não certificada pela auditoria, pois secrets, banco, providers e topologia não foram fornecidos.

# 21. Ordem recomendada para recuperação/reconstrução

A recomendação é **recuperar e validar a arquitetura existente**, não recriar um backend novo.

## Fase 1 — Reprodutibilidade e ambiente

1. Fixar Node 22, pnpm 11 e versões lockadas.
2. Criar ambiente PostgreSQL descartável.
3. Aplicar migrations sem alterações.
4. Validar `prisma validate`, `generate`, typecheck, lint e build no CI.
5. Documentar variáveis obrigatórias e separar secrets de teste/desenvolvimento/produção.

## Fase 2 — Testes de integração

1. Executar `postgres-repositories.integration.spec.ts` com banco descartável.
2. Adicionar E2E da API principal para cadastro/login/refresh/logout.
3. Exercitar ownership, exclusão de conta e cleanup.
4. Exercitar sync push/bootstrap/changes com concorrência e retenção.
5. Exercitar scan upload/status/cancel/feedback contra PostgreSQL real com providers fake.

## Fase 3 — Dependências externas

1. Configurar Google e Apple em sandbox.
2. Configurar RevenueCat sandbox e validar webhooks assinados.
3. Configurar Gemini/OpenAI com limites e timeouts documentados.
4. Configurar VAPID e validar reminders/push.
5. Configurar Scan Cloud cleanup e testar account generation/replay.

## Fase 4 — Operação

1. Definir processo persistente para scheduler e scan workers.
2. Confirmar `trust proxy` com o ingress real.
3. Adicionar rate limiter HTTP no scan-service ou documentar proteção do gateway.
4. Adicionar métricas, alertas e, se necessário, Sentry.
5. Definir retenção de jobs, feedback, journal e imagens.
6. Executar load test somente em ambiente controlado.

## Fase 5 — Endurecimento antes de produção

1. Impor teto para refresh expiration.
2. Formalizar overrides `RATE_LIMIT_*` no schema.
3. Proteger/desabilitar Swagger em ambientes acessíveis.
4. Adicionar secret scanning e dependency scanning no CI.
5. Revisar todos os usos de `details`, `errors`, `path` e logs sensíveis.
6. Medir coverage de linhas/branches e adicionar casos para Gemini e E2E.

## Apêndice A — Catálogo completo dos 111 endpoints

O catálogo integral, extraído dos controllers reais, segue abaixo. Ele preserva o inventário endpoint-a-endpoint com método, rota, controller, finalidade, autenticação, parâmetros, body/DTO, respostas, service e tabelas.

# Catálogo endpoint-a-endpoint da API

Os códigos explicitamente declarados pelo controller aparecem na coluna de resposta. Quando a validação está no service ou no `ValidationPipe` global, isso é indicado como `service/domain` ou `422/400 global`.

| # | Método | Rota | Controller/handler | Auth/guard | Parâmetros e body | DTO | Resposta/status declarado | Service chamado | Tabelas envolvidas |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | `GET` | `/achievements` | AchievementsController.list — Lista conquistas e progresso do usuario | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | 200 Lista de conquistas | `achievementsService.listWithProgress` | module tables |
| 2 | `GET` | `/analytics/weekly` | AnalyticsController.getWeeklySummary — Resumo semanal de calorias e nutrientes | JWT: JwtAuthGuard | query offset:string; authenticated user: JwtPayload | — | 200 Resumo semanal retornado com sucesso | `analyticsService.getWeeklySummary` | module tables |
| 3 | `GET` | `/analytics/weight-trend` | AnalyticsController.getWeightTrend — Tendencia de peso ao longo do tempo | JWT: JwtAuthGuard | query days:string; authenticated user: JwtPayload | — | 200 Dados de tendencia de peso retornados com sucesso | `analyticsService.getWeightTrend` | module tables |
| 4 | `POST` | `/auth/guest` | AuthController.guest — Criar ou retomar conta convidada da instalacao | sem guard explícito | body GuestDto; response | GuestDto | default NestJS | `authService.createGuest` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 5 | `POST` | `/auth/register` | AuthController.register — Criar conta | sem guard explícito | body RegisterDto; response | RegisterDto | 201 Conta criada; 409 E-mail ja cadastrado | `authService.register` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 6 | `POST` | `/auth/login` | AuthController.login — Login | sem guard explícito | body LoginDto; response | LoginDto | 200; 200 Login realizado; 401 Credenciais invalidas | `authService.login` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 7 | `POST` | `/auth/refresh` | AuthController.refresh — Renovar access token via refresh token | sem guard explícito | request; response | — | 200; 200 Token renovado; 401 Refresh token invalido | `authService.refreshTokens` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 8 | `POST` | `/auth/logout` | AuthController.logout — Logout (revoga refresh token) | sem guard explícito | request; response | — | 204; 204 Logout realizado | `authService.logout, authService.logoutByAccessToken` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 9 | `GET` | `/auth/google` | AuthController.googleAuth — Iniciar OAuth Google com state e PKCE S256 | OAuth Google: GoogleOAuthStartGuard | — | — | 302 Redireciona para Google | `delegação não capturada` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 10 | `GET` | `/auth/google/callback` | AuthController.googleCallback — — | OAuth Google: GoogleOAuthCallbackGuard | request; response | — | default NestJS | `authService.createGoogleAuthorizationCode` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 11 | `POST` | `/auth/oauth/exchange` | AuthController.exchangeOAuthCode — Trocar codigo OAuth de uso unico por tokens usando PKCE | sem guard explícito | body OAuthCodeExchangeDto; response | OAuthCodeExchangeDto | 200 | `authService.exchangeOAuthCode` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 12 | `POST` | `/auth/google/mobile` | AuthController.googleMobile — Google login via mobile idToken | sem guard explícito | body GoogleMobileDto; response | GoogleMobileDto | 200; 200 Login Google mobile realizado; 401 Token Google invalido | `authService.googleMobileLogin` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 13 | `POST` | `/auth/apple/mobile` | AuthController.appleMobile — Apple login via mobile identityToken | sem guard explícito | body AppleMobileDto; response | AppleMobileDto | 200; 200 Login Apple mobile realizado; 401 Token Apple invalido | `authService.appleMobileLogin` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 14 | `POST` | `/auth/link/google` | AuthController.linkGoogle — Vincular Google a conta convidada autenticada | JWT: JwtAuthGuard | body GoogleMobileDto; authenticated user: JwtPayload | GoogleMobileDto | 200 | `authService.linkGoogle` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 15 | `POST` | `/auth/link/apple` | AuthController.linkApple — Vincular Apple a conta convidada autenticada | JWT: JwtAuthGuard | body AppleMobileDto; authenticated user: JwtPayload | AppleMobileDto | 200 | `authService.linkApple` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 16 | `POST` | `/auth/apple/deletion-authorization` | AuthController.prepareAppleDeletion — Revalidar Apple e preparar revogacao antes de excluir a conta | JWT: JwtAuthGuard | body AppleMobileDto; authenticated user: JwtPayload | AppleMobileDto | 200 | `authService.prepareAppleAccountDeletion` | users; refresh_tokens; oauth_authorization_codes; apple_credentials |
| 17 | `POST` | `/billing/revenuecat/reconcile` | BillingController.reconcileRevenueCat — Conciliar assinatura RevenueCat do usuario autenticado | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | 200 | `revenueCatService.reconcileUser` | billing_subjects; billing_subscriptions; premium_entitlements; premium_trial_uses; revenuecat_webhook_events |
| 18 | `GET` | `/billing/status` | BillingController.getStatus — Status da assinatura para o usuario autenticado | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | 200 Status atual | `subscriptionAccessService.getStatusPayload` | billing_subjects; billing_subscriptions; premium_entitlements; premium_trial_uses; revenuecat_webhook_events |
| 19 | `POST` | `/billing/revenuecat/webhook` | RevenueCatWebhookController.handle — — | sem guard explícito | header authorization:string | undefined; header x-revenuecat-webhook-signature:string | undefined; request | — | 200 | `revenueCatService.verifyWebhookRequest, revenueCatService.handleWebhookEvent` | billing_subjects; billing_subscriptions; premium_entitlements; premium_trial_uses; revenuecat_webhook_events |
| 20 | `GET` | `/daily-log/today` | DailyLogController.getToday — Resumo do dia atual | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | default NestJS | `dailyLogService.getToday` | daily_logs; water_entries; weight_entries; meals; goals |
| 21 | `GET` | `/daily-log/history` | DailyLogController.getHistory — Historico de logs | JWT: JwtAuthGuard | query days:string; authenticated user: JwtPayload | — | default NestJS | `dailyLogService.getHistory` | daily_logs; water_entries; weight_entries; meals; goals |
| 22 | `GET` | `/daily-log/:date` | DailyLogController.getByDate — Log de um dia especifico (YYYY-MM-DD) | JWT: JwtAuthGuard | path date:string; authenticated user: JwtPayload | — | default NestJS | `dailyLogService.getByDate` | daily_logs; water_entries; weight_entries; meals; goals |
| 23 | `POST` | `/daily-log/weight` | DailyLogController.logWeight — Registrar peso do dia | JWT: JwtAuthGuard | body LogWeightDto; authenticated user: JwtPayload | LogWeightDto | default NestJS | `dailyLogService.logWeight` | daily_logs; water_entries; weight_entries; meals; goals |
| 24 | `POST` | `/daily-log/water` | DailyLogController.addWater — Adicionar agua | JWT: JwtAuthGuard | body AddWaterDto; authenticated user: JwtPayload | AddWaterDto | default NestJS | `dailyLogService.addWater` | daily_logs; water_entries; weight_entries; meals; goals |
| 25 | `DELETE` | `/daily-log/water/:entryId` | DailyLogController.removeWater — Remover entrada de agua | JWT: JwtAuthGuard | path entryId:string; authenticated user: JwtPayload | — | default NestJS | `dailyLogService.removeWater` | daily_logs; water_entries; weight_entries; meals; goals |
| 26 | `GET` | `/diet/plan` | DietController.getPlan — Plano alimentar ativo | JWT: JwtAuthGuard | header accept-language:string; authenticated user: JwtPayload; response | — | default NestJS | `dietService.getPlanState` | diet_profiles; meal_plans; recipes; plan_mutations |
| 27 | `PUT` | `/diet/plan` | DietController.updatePlan — Substituir plano alimentar ativo (apos regen de refeicao) | JWT: JwtAuthGuard | — | — | default NestJS | `delegação não capturada` | diet_profiles; meal_plans; recipes; plan_mutations |
| 28 | `PUT` | `/diet/plan/meal` | DietController.swapMeal — Trocar refeicao por alternativa autorizada, de forma atomica | JWT: JwtAuthGuard | header idempotency-key:string; header accept-language:string; body SwapMealDto; authenticated user: JwtPayload | SwapMealDto | default NestJS | `dietService.swapMeal` | diet_profiles; meal_plans; recipes; plan_mutations |
| 29 | `GET` | `/diet/recipes` | DietController.listRecipes — Catalogo de receitas | JWT: JwtAuthGuard | header accept-language:string; authenticated user: JwtPayload | — | default NestJS | `dietService.listRecipes` | diet_profiles; meal_plans; recipes; plan_mutations |
| 30 | `GET` | `/diet/recipes/:id` | DietController.getRecipe — Detalhe de receita | JWT: JwtAuthGuard | path id:string; header accept-language:string; authenticated user: JwtPayload | — | default NestJS | `dietService.getRecipe` | diet_profiles; meal_plans; recipes; plan_mutations |
| 31 | `GET` | `/diet/profile` | DietController.getProfile — Perfil de dieta | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | default NestJS | `dietService.getProfile` | diet_profiles; meal_plans; recipes; plan_mutations |
| 32 | `PUT` | `/diet/profile` | DietController.putProfile — Salvar perfil de dieta | JWT: JwtAuthGuard | body DietProfileDto; authenticated user: JwtPayload | DietProfileDto | default NestJS | `dietService.upsertProfile` | diet_profiles; meal_plans; recipes; plan_mutations |
| 33 | `GET` | `/foods/search` | FoodDatabaseController.search — Buscar alimentos por nome | sem guard explícito | query :SearchFoodDto | — | 200 Resultados da busca | `foodDatabaseService.search` | food_items |
| 34 | `GET` | `/foods/categories` | FoodDatabaseController.getCategories — Listar categorias de alimentos | sem guard explícito | — | — | 200 Lista de categorias | `foodDatabaseService.getCategories` | food_items |
| 35 | `GET` | `/foods/:id` | FoodDatabaseController.findById — Buscar alimento por ID | sem guard explícito | path id:string | — | 200 Alimento encontrado | `foodDatabaseService.findById` | food_items |
| 36 | `GET` | `/gamification/profile` | GamificationController.getProfile — Perfil de gamificacao do usuario | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | 200 Perfil com pontos, nivel, badges e eventos recentes | `gamificationService.getProfile` | gamification_profiles; points_events; badges; user_badges |
| 37 | `GET` | `/gamification/badges` | GamificationController.getBadges — Catalogo de badges com estado de desbloqueio do usuario | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | 200 Lista de badges | `gamificationService.getBadges` | gamification_profiles; points_events; badges; user_badges |
| 38 | `POST` | `/gamification/events` | GamificationController.recordEvent — Ingestao idempotente de evento de pontos (servidor recalcula pontos) | JWT: JwtAuthGuard | body PointsEventDto; authenticated user: JwtPayload | PointsEventDto | 201 Perfil autoritativo atualizado | `gamificationService.recordEvent` | gamification_profiles; points_events; badges; user_badges |
| 39 | `GET` | `/glp1-consent` | Glp1ConsentController.get — Obter o consentimento GLP-1 ativo | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 40 | `POST` | `/glp1-consent` | Glp1ConsentController.accept — Registrar consentimento GLP-1 versionado | JWT: JwtAuthGuard | body AcceptGlp1ConsentDto; authenticated user: JwtPayload | AcceptGlp1ConsentDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 41 | `POST` | `/glp1/setup` | Glp1SetupController.setup — Criar consentimento, tratamento, periodo e dose inicial em uma transacao | JWT: JwtAuthGuard; JwtAuthGuard | header idempotency-key:string; body SetupGlp1Dto; authenticated user: JwtPayload | SetupGlp1Dto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 42 | `GET` | `/treatments` | TreatmentsController.list — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | query status:string; authenticated user: JwtPayload | — | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 43 | `POST` | `/treatments` | TreatmentsController.create — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | header idempotency-key:string; body CreateTreatmentDto; authenticated user: JwtPayload | CreateTreatmentDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 44 | `PATCH` | `/treatments/:id` | TreatmentsController.update — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | path id:string; body UpdateTreatmentDto; authenticated user: JwtPayload | UpdateTreatmentDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 45 | `POST` | `/treatments/:id/pause` | TreatmentsController.pause — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | path id:string; body TreatmentTransitionDto; authenticated user: JwtPayload | TreatmentTransitionDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 46 | `POST` | `/treatments/:id/resume` | TreatmentsController.resume — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | path id:string; body TreatmentTransitionDto; authenticated user: JwtPayload | TreatmentTransitionDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 47 | `POST` | `/treatments/:id/complete` | TreatmentsController.complete — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | path id:string; body TreatmentTransitionDto; authenticated user: JwtPayload | TreatmentTransitionDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 48 | `GET` | `/dose-plan-periods` | DosePlanPeriodsController.get — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | query treatmentId:string; authenticated user: JwtPayload | — | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 49 | `POST` | `/dose-plan-periods` | DosePlanPeriodsController.create — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | body CreateDosePlanPeriodDto; authenticated user: JwtPayload | CreateDosePlanPeriodDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 50 | `GET` | `/dose-events` | DoseEventsController.list — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | query treatmentId:string; query limit:string; authenticated user: JwtPayload | — | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 51 | `POST` | `/dose-events` | DoseEventsController.create — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | header idempotency-key:string; body CreateDoseEventDto; authenticated user: JwtPayload | CreateDoseEventDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 52 | `PATCH` | `/dose-events/:id` | DoseEventsController.update — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | path id:string; body UpdateDoseEventDto; authenticated user: JwtPayload | UpdateDoseEventDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 53 | `DELETE` | `/dose-events/:id` | DoseEventsController.delete — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | path id:string; authenticated user: JwtPayload | — | 204 | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 54 | `POST` | `/dose-events/:id/mark-missed` | DoseEventsController.markMissed — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | path id:string; authenticated user: JwtPayload | — | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 55 | `POST` | `/dose-events/:id/mark-skipped` | DoseEventsController.markSkipped — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | path id:string; authenticated user: JwtPayload | — | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 56 | `GET` | `/symptoms` | SymptomsController.list — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | query treatmentId:string; query limit:string; authenticated user: JwtPayload | — | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 57 | `POST` | `/symptoms` | SymptomsController.create — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | header idempotency-key:string; body CreateSymptomDto; authenticated user: JwtPayload | CreateSymptomDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 58 | `PATCH` | `/symptoms/:id` | SymptomsController.update — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | path id:string; body UpdateSymptomDto; authenticated user: JwtPayload | UpdateSymptomDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 59 | `DELETE` | `/symptoms/:id` | SymptomsController.delete — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | path id:string; authenticated user: JwtPayload | — | 204 | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 60 | `GET` | `/reminder-rules` | ReminderRulesController.list — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | query treatmentId:string; authenticated user: JwtPayload | — | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 61 | `POST` | `/reminder-rules` | ReminderRulesController.upsert — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | body UpsertReminderRuleDto; authenticated user: JwtPayload | UpsertReminderRuleDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 62 | `GET` | `/injection-sites` | InjectionSitesController.list — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | authenticated user: JwtPayload | — | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 63 | `POST` | `/injection-sites` | InjectionSitesController.upsert — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | body UpsertInjectionSiteDto; authenticated user: JwtPayload | UpsertInjectionSiteDto | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 64 | `GET` | `/timeline` | TimelineController.get — — | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | query treatmentId:string; query limit:string; authenticated user: JwtPayload | — | default NestJS | `delegação não capturada` | glp1_consents; glp1_treatments; glp1_dose_plan_periods; glp1_dose_events; glp1_symptom_events; glp1_reminder_rules; glp1_injection_site_states; glp1_setup_submissions |
| 65 | `POST` | `/goals/calculate-tdee` | GoalsController.calculateTdee — Calcular TDEE + macros (preview, sem auth) | sem guard explícito | body CalculateTdeeDto | CalculateTdeeDto | 201 TDEE calculado | `goalsService.calculateTdee` | goals; users |
| 66 | `POST` | `/goals` | GoalsController.create — Criar meta (desativa anteriores) | JWT: JwtAuthGuard | body CreateGoalDto; authenticated user: JwtPayload | CreateGoalDto | 201 Meta criada | `goalsService.create` | goals; users |
| 67 | `GET` | `/goals/active` | GoalsController.findActive — Meta ativa do usuario | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | 200 Meta ativa; 404 Sem meta ativa | `goalsService.findActive` | goals; users |
| 68 | `PATCH` | `/goals/:id` | GoalsController.update — Atualizar meta | JWT: JwtAuthGuard | path id:string; body Partial<CreateGoalDto>; authenticated user: JwtPayload | Partial<CreateGoalDto> | 200 Meta atualizada | `goalsService.update` | goals; users |
| 69 | `GET` | `/health` | HealthController.check — Health check | sem guard explícito | — | — | default NestJS | `delegação não capturada` | health check; Prisma/database connection |
| 70 | `GET` | `/load-test/ping` | LoadTestController.ping — — | sem guard explícito | header x-load-test-key:string | undefined | — | default NestJS | `loadTestService.ping` | load_test_events |
| 71 | `GET` | `/load-test/db` | LoadTestController.db — — | sem guard explícito | header x-load-test-key:string | undefined | — | default NestJS | `loadTestService.db` | load_test_events |
| 72 | `POST` | `/load-test/db-write` | LoadTestController.dbWrite — — | sem guard explícito | header x-load-test-key:string | undefined | — | default NestJS | `loadTestService.dbWrite` | load_test_events |
| 73 | `POST` | `/load-test/db-mixed` | LoadTestController.dbMixed — — | sem guard explícito | query reads:string | undefined; query writes:string | undefined; header x-load-test-key:string | undefined | — | default NestJS | `loadTestService.dbMixed` | load_test_events |
| 74 | `POST` | `/load-test/db-cleanup` | LoadTestController.dbCleanup — — | sem guard explícito | header x-load-test-key:string | undefined | — | default NestJS | `loadTestService.dbCleanup` | load_test_events |
| 75 | `POST` | `/meals` | MealsController.save — Salvar refeicao confirmada | JWT: JwtAuthGuard | header idempotency-key:string; body SaveMealDto; authenticated user: JwtPayload | SaveMealDto | default NestJS | `mealsService.save` | meals; users |
| 76 | `GET` | `/meals` | MealsController.findAll — Listar refeicoes | JWT: JwtAuthGuard | query limit:string; query offset:string; query from:string; query to:string; authenticated user: JwtPayload | — | default NestJS | `mealsService.findByUser` | meals; users |
| 77 | `GET` | `/meals/:id` | MealsController.findOne — Detalhe de uma refeicao | JWT: JwtAuthGuard | path id:string; authenticated user: JwtPayload | — | 404 Refeicao nao encontrada | `mealsService.findById` | meals; users |
| 78 | `DELETE` | `/meals/:id` | MealsController.delete — Excluir refeicao | JWT: JwtAuthGuard | path id:string; authenticated user: JwtPayload | — | 204 | `mealsService.delete` | meals; users |
| 79 | `GET` | `/medication-consent` | MedicationConsentController.get — Estado do consentimento de medicamentos | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | 200 { acceptedAt?, version? } | `delegação não capturada` | medication_consents; medications; medication_logs |
| 80 | `POST` | `/medication-consent` | MedicationConsentController.accept — Registrar consentimento (obrigatorio antes de salvar medicamentos) | JWT: JwtAuthGuard | body AcceptConsentDto; authenticated user: JwtPayload | AcceptConsentDto | 201 { acceptedAt, version } | `delegação não capturada` | medication_consents; medications; medication_logs |
| 81 | `GET` | `/medications` | MedicationsController.list — Listar medicamentos do usuario | JWT: JwtAuthGuard; JwtAuthGuard | authenticated user: JwtPayload | — | default NestJS | `delegação não capturada` | medication_consents; medications; medication_logs |
| 82 | `POST` | `/medications` | MedicationsController.create — Criar medicamento (exige consentimento) | JWT: JwtAuthGuard; JwtAuthGuard | body CreateMedicationDto; authenticated user: JwtPayload | CreateMedicationDto | 403 Consentimento ausente | `delegação não capturada` | medication_consents; medications; medication_logs |
| 83 | `PATCH` | `/medications/:id` | MedicationsController.update — Atualizar medicamento (exige consentimento) | JWT: JwtAuthGuard; JwtAuthGuard | path id:string; body UpdateMedicationDto; authenticated user: JwtPayload | UpdateMedicationDto | default NestJS | `delegação não capturada` | medication_consents; medications; medication_logs |
| 84 | `DELETE` | `/medications/:id` | MedicationsController.delete — Excluir medicamento (soft delete) | JWT: JwtAuthGuard; JwtAuthGuard | path id:string; authenticated user: JwtPayload | — | 204 | `delegação não capturada` | medication_consents; medications; medication_logs |
| 85 | `GET` | `/medication-logs` | MedicationLogsController.list — Listar registros de doses | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | query medicationId:string; authenticated user: JwtPayload | — | default NestJS | `delegação não capturada` | medication_consents; medications; medication_logs |
| 86 | `POST` | `/medication-logs` | MedicationLogsController.create — Registrar dose tomada/pulada (exige consentimento) | JWT: JwtAuthGuard; JwtAuthGuard; JwtAuthGuard | body CreateMedicationLogDto; authenticated user: JwtPayload | CreateMedicationLogDto | default NestJS | `delegação não capturada` | medication_consents; medications; medication_logs |
| 87 | `GET` | `/notification-preferences` | NotificationPreferencesController.getPreferences — Obter preferencias de notificacao | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | 200 Preferencias retornadas | `delegação não capturada` | notification_preferences |
| 88 | `PATCH` | `/notification-preferences` | NotificationPreferencesController.updatePreferences — Atualizar preferencias de notificacao | JWT: JwtAuthGuard | body UpdatePreferencesDto; authenticated user: JwtPayload | UpdatePreferencesDto | 200 Preferencias atualizadas | `delegação não capturada` | notification_preferences |
| 89 | `POST` | `/notification-preferences/push-subscription` | NotificationPreferencesController.registerPushSubscription — Registrar push subscription | JWT: JwtAuthGuard | body PushSubscriptionDto; authenticated user: JwtPayload | PushSubscriptionDto | 201 Push subscription registrada | `delegação não capturada` | notification_preferences |
| 90 | `POST` | `/onboarding/preview` | OnboardingController.preview — Gerar uma previa anonima e nao persistida do plano | sem guard explícito | header accept-language:string; body CompleteOnboardingDto | CompleteOnboardingDto | 201 Previa de metas, dieta e treino gerada | `onboardingService.preview` | onboarding_submissions; users; diet_profiles; meal_plans; workout_plans |
| 91 | `POST` | `/onboarding/complete` | OnboardingController.complete — Finalizar onboarding e retornar meta, dieta e treino prontos | JWT: JwtAuthGuard | header accept-language:string; header idempotency-key:string; body CompleteOnboardingDto; authenticated user: JwtPayload | CompleteOnboardingDto | 201 Onboarding finalizado com planos ativos | `onboardingService.complete` | onboarding_submissions; users; diet_profiles; meal_plans; workout_plans |
| 92 | `POST` | `/onboarding/plans/ensure` | OnboardingController.ensurePlans — Garantir provisionamento idempotente de dieta e treino | JWT: JwtAuthGuard | header accept-language:string; authenticated user: JwtPayload | — | 201 Estado atual dos planos e recuperacao agendada | `onboardingService.ensurePlans` | onboarding_submissions; users; diet_profiles; meal_plans; workout_plans |
| 93 | `GET` | `/referrals/me` | ReferralsController.getMine — Codigo de indicacao e estatisticas | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | 200 Dados de indicacao | `referralsService.getReferralDashboard` | referrals; users |
| 94 | `POST` | `/scan-auth/v1/assertions` | ScanAuthController.issue — Emite assertion curta para autenticar no servico de scan | JWT: JwtAuthGuard | body IssueScanAssertionDto; authenticated user: JwtPayload | IssueScanAssertionDto | 200 | `scanAssertionService.issue` | JWT/config only |
| 95 | `GET` | `/streaks` | StreaksController.getStreak — Streak atual do usuario | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | default NestJS | `streaksService.getStreak` | streaks |
| 96 | `POST` | `/sync/v1/push` | SyncController.push — Aplica um lote allowlisted de mutacoes offline | JWT: JwtAuthGuard | header content-length:string; body PushSyncDto; authenticated user: JwtPayload | PushSyncDto | 200 | `syncService.push` | sync_mutations; sync_changes; sync_bootstrap_sessions; sync_state; domain tables |
| 97 | `GET` | `/sync/v1/changes` | SyncController.getChanges — Retorna alteracoes canonicas posteriores ao cursor | JWT: JwtAuthGuard | query :GetSyncChangesQueryDto; authenticated user: JwtPayload | — | default NestJS | `syncService.getChanges` | sync_mutations; sync_changes; sync_bootstrap_sessions; sync_state; domain tables |
| 98 | `GET` | `/sync/v1/bootstrap` | SyncController.getBootstrap — Retorna snapshot paginado dos dominios habilitados | JWT: JwtAuthGuard | query :GetSyncBootstrapQueryDto; authenticated user: JwtPayload | — | default NestJS | `syncService.getBootstrap` | sync_mutations; sync_changes; sync_bootstrap_sessions; sync_state; domain tables |
| 99 | `GET` | `/users/me` | UsersController.getMe — Perfil do usuario autenticado | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | 200 Dados do perfil | `usersService.findMe` | users; goals; diet_profiles; workout_profiles; scan_account_cleanup_tasks |
| 100 | `PATCH` | `/users/me` | UsersController.updateMe — Atualizar perfil | JWT: JwtAuthGuard | body UpdateUserDto; authenticated user: JwtPayload | UpdateUserDto | 200 Perfil atualizado | `usersService.update` | users; goals; diet_profiles; workout_profiles; scan_account_cleanup_tasks |
| 101 | `PATCH` | `/users/me/body-data` | UsersController.updateBodyData — Atualizar dados corporais/meta e retornar planos prontos | JWT: JwtAuthGuard | header accept-language:string; body BodyDataDto; authenticated user: JwtPayload | BodyDataDto | 200 Perfil, meta, dieta e treino recalculados | `bodyDataService.update` | users; goals; diet_profiles; workout_profiles; scan_account_cleanup_tasks |
| 102 | `DELETE` | `/users/me` | UsersController.deleteMe — Excluir conta, sessoes, dados relacionados e uploads pendentes | AccountDeletionAuthGuard | authenticated user: JwtPayload | — | 204; 204 Conta e dados ativos excluidos | `usersService.deleteAccount` | users; goals; diet_profiles; workout_profiles; scan_account_cleanup_tasks |
| 103 | `GET` | `/workout/plan` | WorkoutController.getPlan — Plano de treino ativo | JWT: JwtAuthGuard | header accept-language:string; authenticated user: JwtPayload; response | — | default NestJS | `workoutService.getPlanState` | workout_profiles; workout_plans; workout_templates; workout_sessions; plan_mutations |
| 104 | `PUT` | `/workout/plan` | WorkoutController.updatePlan — Substituir plano de treino ativo | JWT: JwtAuthGuard | — | — | default NestJS | `delegação não capturada` | workout_profiles; workout_plans; workout_templates; workout_sessions; plan_mutations |
| 105 | `PUT` | `/workout/plan/exercise` | WorkoutController.swapExercise — Trocar exercicio por alternativa autorizada, de forma atomica | JWT: JwtAuthGuard | header idempotency-key:string; header accept-language:string; body SwapExerciseDto; authenticated user: JwtPayload | SwapExerciseDto | default NestJS | `workoutService.swapExercise` | workout_profiles; workout_plans; workout_templates; workout_sessions; plan_mutations |
| 106 | `GET` | `/workout/profile` | WorkoutController.getProfile — Perfil de treino | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | default NestJS | `workoutService.getProfile` | workout_profiles; workout_plans; workout_templates; workout_sessions; plan_mutations |
| 107 | `PUT` | `/workout/profile` | WorkoutController.putProfile — Personalizar perfil e montar o plano de treino imediatamente | JWT: JwtAuthGuard | header accept-language:string; body WorkoutProfileDto; authenticated user: JwtPayload | WorkoutProfileDto | 422 Condicao de saude bloqueia treino | `workoutService.generateReadyPlan` | workout_profiles; workout_plans; workout_templates; workout_sessions; plan_mutations |
| 108 | `POST` | `/workout/sessions` | WorkoutController.createSession — Iniciar sessao de treino | JWT: JwtAuthGuard | body CreateSessionDto; authenticated user: JwtPayload | CreateSessionDto | default NestJS | `workoutService.createSession` | workout_profiles; workout_plans; workout_templates; workout_sessions; plan_mutations |
| 109 | `GET` | `/workout/sessions` | WorkoutController.listSessions — Listar sessoes de treino | JWT: JwtAuthGuard | authenticated user: JwtPayload | — | default NestJS | `workoutService.listSessions` | workout_profiles; workout_plans; workout_templates; workout_sessions; plan_mutations |
| 110 | `GET` | `/workout/sessions/:id` | WorkoutController.getSession — Detalhe da sessao | JWT: JwtAuthGuard | path id:string; authenticated user: JwtPayload | — | default NestJS | `workoutService.getSession` | workout_profiles; workout_plans; workout_templates; workout_sessions; plan_mutations |
| 111 | `PUT` | `/workout/sessions/:id` | WorkoutController.updateSession — Atualizar/finalizar sessao | JWT: JwtAuthGuard | path id:string; body UpdateSessionDto; authenticated user: JwtPayload | UpdateSessionDto | default NestJS | `workoutService.updateSession` | workout_profiles; workout_plans; workout_templates; workout_sessions; plan_mutations |

**Total extraído:** 111 endpoints.

