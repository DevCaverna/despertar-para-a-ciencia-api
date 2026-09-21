# Deploy e recuperação

O deploy promove uma imagem OCI previamente validada para Podman rootless. O script privilegia uma troca segura da aplicação, mas não implementa rollback automático de schema ou dados.

## Pré-condições

A VPS precisa de Podman rootless, `uidmap`, `flock`, `timeout` e um usuário de deploy sem privilégios com chave SSH autorizada e lingering habilitado. Não conceda `sudo`, grupo `docker` ou login no GHCR a esse usuário.

A API é publicada somente em `127.0.0.1:$PORT`; um proxy reverso gerenciado separadamente é responsável por exposição externa em 80 e 443. O host precisa manter backups e um procedimento de recuperação de banco fora deste repositório.

## Procedimento de deploy

1. O runner valida assinatura, attestation, digest e source SHA, salva a imagem OCI e a transfere por SSH.
2. O runner envia `runtime.env`, `migration.env` e o script de deploy para um diretório remoto temporário; a VPS não retém esses arquivos.
3. O script serializa deploys por ambiente com `flock`, valida separadamente os ambientes runtime e migration e verifica que usam usuários PostgreSQL distintos, sem exigir endpoints iguais. Somente depois executa `migration status`, `db migrate` e `db verify`.
4. Um contêiner candidato inicia com filesystem somente leitura e `/tmp` em tmpfs. Ele precisa responder a `GET /health/ready` em até 30 tentativas.
5. Após a aprovação do candidato, o contêiner ativo é substituído por outro com a mesma imagem, reinício `unless-stopped`, filesystem somente leitura e porta em loopback. O host preserva as tags `active` e `previous` do ambiente para execução atual e rollback imediato; ao fim de um deploy bem-sucedido, remove somente imagens dangling com o label OCI da aplicação.

## Falha e recuperação

Se o candidato não ficar pronto, ele é removido e o contêiner ativo não é alterado. Se a promoção falhar, o script preserva a imagem anterior, tenta iniciá-la novamente e valida sua readiness. Se esse rollback também falhar, investigue logs do Podman, disponibilidade do banco e configuração do ambiente antes de nova tentativa.

Migrations são executadas antes da promoção. Portanto, restaurar a imagem anterior não reverte schema nem dados. Em falha parcial de migration ou incompatibilidade entre aplicação e schema, interrompa deploys concorrentes, determine o estado aplicado com a credencial administrativa e use uma migration corretiva ou o procedimento externo de recuperação de banco. Não edite migrations aplicadas.

Para rotacionar credenciais, atualize o GitHub Environment, execute um deploy e valide `GET /health/ready`. Para reimplantar uma versão anterior, use uma tag de release existente; isso só é seguro quando essa aplicação é compatível com o schema já aplicado.
