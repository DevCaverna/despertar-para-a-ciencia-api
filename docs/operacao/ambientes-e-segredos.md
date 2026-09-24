# Ambientes e segredos

[`.env.example`](../../.env.example) é o catálogo canônico das variáveis da aplicação. Este documento registra as separações operacionais que não são evidentes apenas pela lista.

## Runtime e migrations

`DATABASE_URL` é usada pela API, Prisma CLI e scripts administrativos. `REDIS_URL` é obrigatória no runtime: Redis armazena códigos temporários e limites de envio, e a readiness depende de um `PING` bem-sucedido. Planeje disponibilidade e monitoração do Redis junto com PostgreSQL. As variáveis aceitas e suas regras de validação pertencem a [`.env.example`](../../.env.example) e ao schema de configuração.

## GitHub Environment

Cada destino de deploy usa GitHub Environment. Variáveis não sensíveis de operação são Actions Variables; credenciais de deploy, banco, Redis, Firebase, Brevo, R2 e Google são Actions Secrets. O workflow cria `runtime.env` por allowlist, temporário e com permissão `600`; o mesmo `DATABASE_URL` do runtime é usado para migrations no procedimento de deploy.

A chave privada Firebase multiline é serializada no arquivo temporário com `\n` literal. `EMAIL_VERIFICATION_HMAC_SECRET` é obrigatório, deve conter ao menos 32 caracteres aleatórios e precisa ser configurado como GitHub Actions Secret em cada Environment de deploy. Não coloque secrets em argumentos de comando, imagens OCI, logs ou arquivos persistentes da VPS.

## Menor privilégio e rotação

O runner autentica no GHCR e transfere a imagem por SSH; a VPS não precisa nem deve manter autenticação no registry. O usuário de deploy não recebe `sudo`, grupo `docker` ou credenciais administrativas permanentes.

Ao adicionar um secret, primeiro confirme que ele é realmente necessário, declare e valide a variável na aplicação quando ela for consumida em runtime, adicione-o à allowlist adequada do workflow e documente apenas a consequência operacional. Rotacione credenciais no provider e no GitHub Environment, depois faça deploy e valide readiness. Consulte [Deploy e recuperação](deploy-e-recuperacao.md) para o fluxo de promoção.

Para testar o cadastro completo localmente sem provedores externos, configure `NODE_ENV=development`, `MAIL_DRIVER=local-capture` e `SEND_EMAILS=true` no `.env`, e use o Firebase Auth Emulator do projeto com `FIREBASE_PROJECT_ID` correspondente e `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`. Crie/autentique a identidade pelo cliente Firebase configurado para o Emulator e obtenha seu ID token. Inicie a API e solicite `POST /users/send-email-verification-code`; o e-mail, incluindo o código, será gravado em `.local-mail/verification-emails.jsonl` (uma mensagem JSON por linha), que pode ser consultado localmente. Use o `code` desse e-mail em `POST /users/profile` com o ID token. O driver é aceito somente em `development`, não registra o código nos logs e o arquivo é ignorado pelo Git; remova-o após o teste quando não precisar mais dele. O código continua armazenado no Redis somente como HMAC-SHA-256 e é consumido atomicamente na verificação.
