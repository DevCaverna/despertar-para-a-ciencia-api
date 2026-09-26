# Documentação

Este diretório registra apenas conhecimento do projeto que não deve depender de inferência pela implementação, de tentativa e erro ou de documentação genérica de frameworks. Um conceito possui somente um documento canônico; os demais devem apontar para ele por link.

## Onde encontrar cada assunto

| Preciso entender...                 | Documento                                                             |
| ----------------------------------- | --------------------------------------------------------------------- |
| Arquitetura e fronteiras            | [Visão geral](arquitetura/visao-geral.md)                             |
| Autenticação, perfis e papéis       | [Autenticação e usuários](arquitetura/autenticacao-e-usuarios.md)     |
| Convenções específicas da aplicação | [Convenções da aplicação](desenvolvimento/convencoes-da-aplicacao.md) |
| Alterar o banco de dados            | [Migrations do banco](desenvolvimento/migracoes-do-banco.md)          |
| CI, imagem e cadeia de entrega      | [CI/CD](entrega/ci-cd.md)                                             |
| Releases e changelog                | [Releases e changelog](entrega/releases-e-changelog.md)               |
| Ambientes e secrets                 | [Ambientes e segredos](operacao/ambientes-e-segredos.md)              |
| Deploy, falhas e recuperação        | [Deploy e recuperação](operacao/deploy-e-recuperacao.md)              |
| Telemetria emitida pela API         | [Telemetria](operacao/telemetria.md)                                  |

## Fontes canônicas

| Informação                         | Fonte canônica                                               |
| ---------------------------------- | ------------------------------------------------------------ |
| Versões e comandos                 | [`package.json`](../package.json) e lockfile                 |
| Variáveis disponíveis              | [`.env.example`](../.env.example) e schema de validação      |
| Implementação de workflows         | [`.github/workflows/`](../.github/workflows/)                |
| Intenção e invariantes de entrega  | [CI/CD](entrega/ci-cd.md)                                    |
| Implementação do banco             | Contract e `migrations/`                                     |
| Procedimento de alteração do banco | [Migrations do banco](desenvolvimento/migracoes-do-banco.md) |
| Mudanças notáveis                  | [`CHANGELOG.md`](../CHANGELOG.md)                            |
| Decisões arquiteturais históricas  | ADR em `docs/decisoes/` quando existir                       |
| Propostas em discussão             | RFC em `docs/rfcs/` quando existir                           |

## Padrão editorial

- Arquivos em `docs/` usam pt-BR, ASCII, lowercase e kebab-case; a exceção é este `README.md`.
- Cada documento possui exatamente um H1, como primeira linha significativa.
- Use links relativos; não copie uma explicação já coberta pela fonte canônica.
- Evite seções genéricas, explicações de framework e diagramas decorativos.
- Use `runtime`, `migration`, `deploy`, `release`, `rollback`, `workflow`, `job`, `runner`, `contêiner`, banco de dados e ambiente de forma consistente.

## ADRs e RFCs

Crie `docs/decisoes/0001-titulo-curto.md` somente para uma decisão duradoura, com alternativas razoáveis e consequência arquitetural. Use o título `# ADR 0001 — Título` e as seções `Status`, `Contexto`, `Decisão`, `Consequências` e `Alternativas consideradas`; os status permitidos são `Proposto`, `Aceito`, `Rejeitado` e `Substituído`.

Crie `docs/rfcs/0001-titulo-curto.md` antes de uma proposta relevante ainda em discussão. Use o título `# RFC 0001 — Título` e as seções `Status`, `Contexto`, `Proposta`, `Impactos`, `Riscos`, `Estratégia de adoção` e `Questões em aberto`. Depois da decisão, registre o comportamento no documento canônico e, quando necessário, em um ADR.
