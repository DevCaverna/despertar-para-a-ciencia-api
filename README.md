# Despertar para a Ciência API

API HTTP do projeto Despertar para a Ciência, desenvolvida com NestJS, TypeScript (ESM nativo), PostgreSQL, Prisma contract-first, Redis e Firebase Auth, com integrações externas isoladas por portas e adaptadores.

O sistema mantém limites verificáveis entre camadas: validação de configuração na inicialização, migrations Prisma a partir de artefatos versionados e entrega por imagem OCI única validada.

## Pré-requisitos

- Node.js 24 (`engines.node` em [`package.json`](package.json)).
- pnpm 12.3.4 via Corepack (`packageManager` em [`package.json`](package.json)).
- PostgreSQL e Redis acessíveis no ambiente local.
- Firebase Auth Emulator (`firebase-tools`) ou projeto Firebase de desenvolvimento para fluxos autenticados.

## Garantias principais

- Configuração validada na inicialização antes de aceitar tráfego.
- Credenciais administrativas de banco e migrations Prisma verificadas por artefatos versionados.
- Testes unitários, testes E2E contra PostgreSQL descartável e smoke test da imagem OCI.
- Imagem OCI única, escaneada, com SBOM e assinatura Cosign antes do deploy.

## Primeiros passos

1. Habilite o Corepack e instale as dependências: `corepack enable && pnpm install`.
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL`, `REDIS_URL`, `EMAIL_VERIFICATION_HMAC_SECRET` e as configurações do Firebase (veja [Ambientes e segredos](docs/operacao/ambientes-e-segredos.md)).
3. Aplique as migrations e verifique o estado do banco seguindo [Migrations do banco](docs/desenvolvimento/migracoes-do-banco.md).
4. Opcionalmente, popule dados de demonstração com `pnpm seed:demo` (detalhes em [Dados de demonstração](docs/desenvolvimento/dados-de-demonstracao.md)).
5. Inicie a API em modo de desenvolvimento:

```bash
pnpm start:dev
```

## Comandos essenciais

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm docs:check
pnpm prisma:contract:check
pnpm prisma:migration:check
```

Os comandos disponíveis e suas versões são definidos em [`package.json`](package.json). O catálogo de configuração é [`.env.example`](.env.example).

## Documentação

Consulte o [índice da documentação](docs/README.md) antes de alterar código, banco de dados, workflows ou operação. O processo de contribuição está em [CONTRIBUTING.md](CONTRIBUTING.md).
