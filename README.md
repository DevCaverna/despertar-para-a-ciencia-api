# Template de API NestJS

Template de API NestJS orientado para produção. Fornece uma base com TypeScript, ESM nativo, PostgreSQL, Prisma contract-first, Firebase Auth e integrações externas por portas e adaptadores.

O template privilegia limites de segurança verificáveis: a API usa uma credencial de banco restrita, migrations usam uma credencial administrativa separada e a entrega promove uma única imagem OCI validada.

## Garantias principais

- Credenciais separadas para runtime e migrations do PostgreSQL.
- Configuração validada antes da inicialização da aplicação.
- Migrations Prisma verificadas e aplicadas a partir de artefatos versionados.
- Testes E2E contra PostgreSQL descartável e smoke test da imagem OCI.
- Imagem OCI única, escaneada, com SBOM e assinatura Cosign antes do deploy.

## Primeiros passos

1. Habilite o Corepack e instale as dependências: `corepack enable && pnpm install`.
2. Copie `.env.example` para `.env` e configure os serviços necessários.
3. Prepare o banco de dados seguindo [Migrations do banco](docs/desenvolvimento/migracoes-do-banco.md).
4. Inicie a API:

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
```

Os comandos disponíveis e suas versões são definidos em [`package.json`](package.json). O catálogo de configuração é [`.env.example`](.env.example).

## Documentação

Consulte o [índice da documentação](docs/README.md) antes de alterar código, banco de dados, workflows ou operação. O processo de contribuição está em [CONTRIBUTING.md](CONTRIBUTING.md).
