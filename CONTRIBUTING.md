# Contribuindo

Contribuições devem preservar os invariantes do template e manter uma única fonte canônica para cada informação.

## Pull Requests

- Parta de `main` atualizado e crie uma branch curta em inglês no formato `<categoria>/<descricao-kebab-case>`, como `feat/migrate-prisma-8`, `fix/pin-cosign-version`, `refactor/esm-vitest-node26` ou `ci/harden-container-validation`.
- Use commits convencionais em inglês, como `feat:`, `fix:`, `refactor:`, `ci:` e `docs:`; inclua um escopo quando ele tornar a mudança mais clara, como `fix(ci):`.
- Direcione Pull Requests para `main` e mantenha cada PR limitado a uma mudança coerente.
- Abra o PR a partir de [`.github/pull_request_template.md`](.github/pull_request_template.md). Preencha descrição, tipo, contexto, checklist, links, variáveis de ambiente, evidências e observações quando aplicáveis; não inclua dados sensíveis.
- Não altere `package.json.version` em Pull Requests.
- Execute os checks pertinentes antes de abrir o PR; a CI valida qualidade, testes, migrations e imagem OCI.
- Não altere `.agents/` em tarefas comuns.

## Alterações documentais

Leia o [índice documental](docs/README.md) antes de criar ou alterar documentação. Atualize o documento canônico da mudança; outros documentos devem apontar para ele por link.

| Mudança                                 | Atualização esperada                                              |
| --------------------------------------- | ----------------------------------------------------------------- |
| Comportamento público relevante         | `CHANGELOG.md`                                                    |
| Processo de migration                   | [Migrations do banco](docs/desenvolvimento/migracoes-do-banco.md) |
| CI, imagem ou deploy                    | [CI/CD](docs/entrega/ci-cd.md)                                    |
| Procedimento operacional                | Documento em [`docs/operacao/`](docs/operacao/)                   |
| Invariante arquitetural                 | Documento em [`docs/arquitetura/`](docs/arquitetura/)             |
| Decisão duradoura com alternativas      | ADR                                                               |
| Proposta relevante ainda não decidida   | RFC                                                               |
| Refactor interno sem mudança conceitual | Nenhuma documentação                                              |

Considere um ADR para decisões duradouras que tenham alternativas razoáveis e consequências arquiteturais. Considere uma RFC antes de mudanças transversais ou incompatíveis. Não crie ADRs, RFCs ou documentos apenas para preencher uma estrutura.

## Banco e dependências

Siga o procedimento em [Migrations do banco](docs/desenvolvimento/migracoes-do-banco.md) para qualquer alteração de schema. Novas dependências devem ter uma necessidade concreta, caber nos limites arquiteturais existentes e ser incluídas nos checks aplicáveis.
