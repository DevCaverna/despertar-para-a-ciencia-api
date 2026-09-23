# Autenticação e usuários

## Responsabilidades

O Firebase Auth autentica pessoas no cliente. A API recebe Firebase ID Tokens, valida assinatura, expiração e revogação pelo Admin SDK e autoriza a requisição pelas custom claims. A API não recebe senhas, não emite JWT próprio e não oferece login, logout, refresh token ou recuperação de senha.

O PostgreSQL armazena o perfil local. A chave primária `User.id` é gerada pelo PostgreSQL com UUID v7 e é a única identidade de domínio persistida. O UID Firebase é usado apenas durante a requisição autenticada; ele não é armazenado no perfil local.

## Claims e papéis

As custom claims administradas pela API são:

| Claim   | Uso                                                         |
| ------- | ----------------------------------------------------------- |
| `id`    | UUID v7 do perfil local no PostgreSQL.                      |
| `roles` | Lista efetiva de papéis: `USER`, `COLLABORATOR` ou `ADMIN`. |

Claims com papéis desconhecidos ou malformados não concedem acesso. Alterações de papéis preservam outras claims existentes e exigem renovação da sessão no cliente. Para redução de privilégios, a API revoga as sessões Firebase.

## Perfil autenticado

O onboarding exige Firebase ID Token. Antes de criar o perfil, o cliente solicita um código por e-mail e o confirma no mesmo e-mail presente no token. A API guarda somente o hash do código no Redis, por até dez minutos e com no máximo cinco tentativas; códigos não são persistidos no PostgreSQL. `POST /users/profile` aceita `name`, `email` e `code`, cria ou reconcilia o perfil pelo e-mail normalizado e grava seu `id` como custom claim no Firebase. O cliente deve executar `getIdToken(true)` antes de chamar rotas que dependem da claim nova.

| Método  | Rota                                  | Comportamento                                          |
| ------- | ------------------------------------- | ------------------------------------------------------ |
| `POST`  | `/users/send-email-verification-code` | Envia código temporário para novo e-mail.              |
| `POST`  | `/users/profile`                      | Cria ou reconcilia o perfil autenticado.               |
| `GET`   | `/users/profile`                      | Retorna o perfil autenticado e ativo.                  |
| `PATCH` | `/users/profile`                      | Atualiza somente o nome do perfil autenticado e ativo. |

Um perfil inativo não acessa as rotas privadas de usuários, mesmo que o token ainda seja formalmente válido.

## Administração

As rotas abaixo exigem `ADMIN` e perfil local ativo:

| Método  | Rota                | Comportamento                                              |
| ------- | ------------------- | ---------------------------------------------------------- |
| `GET`   | `/users`            | Lista perfis paginados e seus papéis efetivos no Firebase. |
| `PATCH` | `/users/:id/roles`  | Substitui o conjunto de papéis do perfil.                  |
| `PATCH` | `/users/:id/status` | Ativa ou desativa o perfil e a conta Firebase.             |

A API não permite remover ou desativar o último administrador ativo.

## Primeiro administrador

Execute `pnpm tsx scripts/create-admin.ts` manualmente no ambiente desejado. O script cria a identidade Firebase quando necessário, cria ou localiza o perfil PostgreSQL e, somente então, aplica a claim `id` e o papel `ADMIN`. Para contas Firebase existentes ele não altera senha nem remove claims existentes.
