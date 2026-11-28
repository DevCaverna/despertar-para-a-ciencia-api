# Dados de demonstração

O script [`scripts/seed-demo.ts`](../../scripts/seed-demo.ts) popula um banco de desenvolvimento com registros fictícios e idempotentes para validar o MVP sem preparação manual extensa. O script recusa execução quando `NODE_ENV=production`.

## Pré-requisitos

- `DATABASE_URL` configurado no ambiente.
- Migrations aplicadas segundo [Migrations do banco](migracoes-do-banco.md).

## Execução

```bash
pnpm seed:demo
```

Execuções repetidas ignoram registros já existentes (verificando `email`, `issn`, `doi` e o par `(authorId, title)`), sem duplicar dados nem sobrescrever alterações manuais.

## Dados criados

- **Usuários (`User`):** três perfis fictícios em `@example.com` representando leitor (`USER`), colaborador (`COLLABORATOR`) e administrador (`ADMIN`).
- **Fontes e trabalhos (`AcademicSource` e `ExternalWork`):** duas fontes por ISSN e três trabalhos acadêmicos, incluindo exemplos com resumo (elegíveis para geração assistida) e um exemplo sem resumo.
- **Publicações (`Post`):** cinco registros cobrindo todos os estados editoriais (`PUBLISHED`, `PENDING_REVIEW`, `DRAFT` e `REJECTED`).

## Reconciliação opcional no Firebase Auth Emulator

Para autenticar as contas fictícias localmente pelo Firebase Auth Emulator, informe `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_PROJECT_ID` e uma senha local em `DEMO_USER_PASSWORD` (mínimo de 12 caracteres) antes de executar `pnpm seed:demo`:

```bash
DEMO_USER_PASSWORD=dev-demo-password-123 pnpm seed:demo
```

Nenhuma senha ou credencial real é versionada no repositório. Para importar artigos reais da Crossref após criar um administrador com `scripts/create-admin.ts`, utilize `POST /academic-works/sync` conforme [Visão geral da arquitetura](../arquitetura/visao-geral.md).
