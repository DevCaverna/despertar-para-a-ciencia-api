# Migrations do banco

Use este procedimento ao alterar o schema. O projeto usa Prisma 8 contract-first: o contract descreve o banco, migrations versionadas carregam as operações aplicadas e a execução administrativa usa uma credencial diferente do runtime.

## Fontes e artefatos

`prisma.config.ts` define `src/prisma/contract.prisma` como contract, `migrations/` como diretório de migrations e `DATABASE_URL` como conexão do Prisma CLI.

| Artefato                                 | Regra                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/prisma/contract.prisma`             | Fonte editável do schema.                                                                |
| `src/prisma/contract.json`               | Gerado, versionado e não editado manualmente.                                            |
| `src/prisma/contract.d.ts`               | Gerado, versionado e não editado manualmente.                                            |
| `migrations/app/<id>/migration.ts`       | Fonte editável da migration; pode receber `rawSql` ou `dataTransform` quando necessário. |
| `migrations/app/<id>/ops.json`           | Artefato compilado executado; não editar manualmente.                                    |
| `migrations/app/<id>/migration.json`     | Metadados e integridade da migration; não editar manualmente.                            |
| `migrations/snapshots/<hash>/contract.*` | Snapshot imutável do contract usado pela migration.                                      |

## Criar uma alteração

1. Edite `src/prisma/contract.prisma`.
2. Emita os artefatos do contract:

```bash
pnpm prisma contract emit
```

3. Planeje a migration:

```bash
pnpm prisma migration plan --name <nome>
```

4. Revise `migrations/app/<id>/migration.ts`. Adicione `rawSql` ou `dataTransform` somente quando o plano gerado não expressar a mudança necessária.
5. Recompile a migration e ateste o pacote executando sua fonte com Node; então revise `ops.json` e `migration.json` resultantes. Não altere esses artefatos manualmente.

```bash
node migrations/app/<id>/migration.ts
```

6. Verifique a integridade das migrations:

```bash
pnpm prisma:migration:check
```

7. Aplique e verifique em um banco descartável:

```bash
pnpm prisma db migrate
pnpm prisma db verify
```

8. Execute os testes E2E:

```bash
pnpm test:e2e
```

Execute também `pnpm prisma:contract:check` antes do PR. Ele reemite o contract e falha se os arquivos gerados versionados divergirem.

## Verificações do Prisma

`prisma migration check` verifica a integridade dos artefatos e do grafo de migrations no repositório. Não aplica mudanças nem demonstra que o banco de destino está atualizado.

`prisma migration status` mostra o caminho e o estado pendente de migrations. `prisma db migrate` aplica migrations ao banco administrativo. `prisma db verify` verifica o banco após a aplicação; ele complementa, e não substitui, o check de artefatos. O deploy executa os três comandos na ordem apropriada.

## Banco descartável e migrations aplicadas

O setup E2E recria o estado de um PostgreSQL exclusivo a partir de migrations, executa `status`, `migrate`, `verify` e provisiona a role de runtime. Nunca aponte E2E para um banco com dados compartilhados.

Não reescreva uma migration que já tenha sido aplicada em ambiente compartilhado. Crie uma nova migration corretiva. O fluxo atual não oferece down migrations automáticas; rollback de aplicação não reverte schema ou dados.

## Falhas e diagnóstico

Quando `migration check` falhar, corrija o contract, a fonte da migration ou seus artefatos gerados; não edite hashes para silenciar o erro. Quando `db verify` detectar drift, interrompa a promoção e compare o banco com as migrations aplicadas antes de decidir uma migration corretiva.

Se uma migration falhar parcialmente ou o deploy falhar depois de aplicá-la, não presuma que restaurar a imagem anterior resolve o banco. Interrompa novas tentativas concorrentes, preserve evidências e siga [Deploy e recuperação](../operacao/deploy-e-recuperacao.md).
