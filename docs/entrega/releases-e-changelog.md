# Releases e changelog

Releases seguem Semantic Versioning e o changelog segue Keep a Changelog. O `CHANGELOG.md` registra apenas mudanças notáveis para quem utiliza ou mantém o template; não é um histórico de commits.

## Changelog

Mantenha mudanças relevantes em `## [Unreleased]` até o release. Use apenas as categorias `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` e `Security`; títulos de categoria e `Unreleased` permanecem em inglês por compatibilidade com Keep a Changelog, mas o texto das entradas usa pt-BR.

Uma entrada deve descrever efeito percebido ou uma alteração relevante de manutenção. Não registre renomeação de variável, formatação ou refactor interno sem mudança conceitual.

```markdown
### Added

- Adicionado smoke test da imagem OCI ao CI de Pull Requests.
```

```markdown
### Changed

- Refatorado método privado.
```

O segundo exemplo não deve entrar no changelog.

## Criar uma release

`Create Release` recebe somente uma versão SemVer sem o prefixo `v`. Ele exige execução em `main`, verifica que `main` não avançou, rejeita build metadata, tags existentes e versões já presentes no changelog, e executa a CI antes de preparar a release. Não acessa GitHub Environments ou secrets de deploy.

`scripts/prepare-release.mjs` exige uma versão maior que a de `package.json` e uma seção `[Unreleased]` não vazia com item em uma categoria permitida. Ele atualiza somente `package.json` e `CHANGELOG.md`, criando `## [X.Y.Z] - AAAA-MM-DD`.

O workflow cria o commit `chore(release): vX.Y.Z`, cria uma tag anotada `vX.Y.Z`, publica ambos atomicamente, constrói a imagem da tag e cria a GitHub Release com a seção correspondente do changelog. Prereleases SemVer geram GitHub Release marcada como prerelease.

Tags de release são imutáveis e não podem ser reutilizadas. Para implantar uma release, use `Deploy Release` com a versão e o Environment desejado; não crie outra imagem para a mesma tag. A cadeia de imagem e deploy está em [CI/CD](ci-cd.md).
