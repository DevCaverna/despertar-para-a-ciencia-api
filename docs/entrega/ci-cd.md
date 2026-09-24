# CI/CD

A entrega estabelece uma cadeia de confiança entre o commit, a imagem OCI e o deploy. Workflows são a fonte de verdade da implementação; este documento descreve suas responsabilidades e invariantes.

## Pull Requests

PRs destinados a `main` executam a CI. O job `quality` verifica contract e migrations Prisma, formatação, lint, sintaxe de scripts shell, typecheck, build e testes do processo de release. Jobs separados executam testes unitários com cobertura, E2E contra PostgreSQL efêmero, Firebase Auth Emulator e smoke da imagem OCI construída por Podman.

O E2E inicia de um banco vazio e aplica migrations antes dos testes. O smoke da imagem não requer PostgreSQL ou Redis: confirma que a imagem inicia, responde a `GET /health/live` e encerra corretamente por `SIGTERM`. Em runtime, `GET /health/ready` depende de conexões saudáveis com PostgreSQL e Redis.

## Imagem e proveniência

Snapshots e releases chamam o workflow de build para produzir uma única imagem OCI. Ela recebe o label `org.opencontainers.image.revision` com o SHA efetivamente empacotado, é publicada por digest, escaneada pelo Trivy para vulnerabilidades `CRITICAL` corrigíveis, recebe SBOM SPDX e é assinada e atestada por Cosign keyless. O build registra tamanhos da imagem, archive e diretórios relevantes como baseline informativo.

O deploy não reconstrói imagens. Antes da transferência, valida formato do digest e SHA, assinatura Cosign, attestation SPDX e a correspondência entre o SHA esperado e o label da imagem.

## Fluxo de entrega

```text
Pull Request -> CI
main -> Create Release -> imagem OCI -> scan, SBOM e assinatura -> GitHub Release
imagem/release + Environment -> Deploy -> candidato -> readiness -> promoção
```

`Create Release` recebe somente uma versão SemVer e produz a tag, imagem e GitHub Release sem acessar Environment ou secrets de deploy. `Deploy Release` recebe versão e Environment, resolve o digest de uma release existente e a implanta sem reconstruir. `Deploy Snapshot` recebe ref e Environment, constrói uma imagem para o SHA resolvido e a implanta. Detalhes de versão estão em [Releases e changelog](releases-e-changelog.md).

## Promoção e rollback

O runner transfere a imagem OCI e arquivos de ambiente temporários por SSH. Na VPS, migrations e verificação de banco acontecem antes da inicialização do candidato. O candidato precisa responder a `GET /health/ready` antes da troca do contêiner ativo.

Caso a nova imagem não fique pronta após a troca, o script tenta restaurar a imagem anterior. Esse rollback é somente da aplicação; não desfaz migrations. O procedimento operacional está em [Deploy e recuperação](../operacao/deploy-e-recuperacao.md).
