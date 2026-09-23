# Autenticação e usuários

## Responsabilidades

O Firebase Auth autentica pessoas no cliente. A API recebe Firebase ID Tokens, valida assinatura, expiração e revogação pelo Admin SDK e autoriza a requisição pelas custom claims. A API não recebe senhas, não emite JWT próprio e não oferece login, logout, refresh token ou recuperação de senha.

O PostgreSQL armazena o perfil local. A chave primária `User.id` é gerada pelo PostgreSQL com UUID v7 e é a única identidade de domínio persistida. O UID Firebase é usado apenas durante a requisição autenticada; ele não é armazenado no perfil local. A reconciliação inicial do perfil legado é feita pelo e-mail autenticado após a verificação temporária descrita abaixo.

## Claims e papéis

As custom claims administradas pela API são:

| Claim   | Uso                                                         |
| ------- | ----------------------------------------------------------- |
| `id`    | UUID v7 do perfil local no PostgreSQL.                      |
| `roles` | Lista efetiva de papéis: `USER`, `COLLABORATOR` ou `ADMIN`. |

Claims com papéis desconhecidos ou malformados não concedem acesso. Alterações de papéis preservam outras claims existentes e exigem renovação da sessão no cliente. Para redução de privilégios, a API revoga as sessões Firebase.

## Perfil autenticado

O onboarding exige Firebase ID Token. Antes de criar ou reconciliar o perfil, o cliente solicita um código por e-mail e o confirma no mesmo e-mail presente no token. A API armazena no Redis somente HMAC-SHA-256 do código, protegido por `EMAIL_VERIFICATION_HMAC_SECRET`, por até dez minutos e com no máximo cinco tentativas. Um script Lua valida, contabiliza tentativas e consome o código atomicamente; o endpoint de envio também aplica limite por IP e destinatário. Códigos não são persistidos no PostgreSQL. `POST /users/profile` aceita `name`, `email` e `code`: para um token sem vínculo local, o código é obrigatório mesmo quando já existe um perfil para o e-mail; somente a repetição de uma operação com a claim `id` já vinculada dispensa nova confirmação. Após validar o código, a API marca `emailVerified` no Firebase e aplica as claims de perfil. O cliente deve executar `getIdToken(true)` antes de chamar rotas que dependem da claim nova.

| Método  | Rota                                  | Comportamento                                          |
| ------- | ------------------------------------- | ------------------------------------------------------ |
| `POST`  | `/users/send-email-verification-code` | Envia código temporário para criação ou reconciliação. |
| `POST`  | `/users/profile`                      | Cria ou reconcilia o perfil autenticado.               |
| `GET`   | `/users/profile`                      | Retorna o perfil autenticado e ativo.                  |
| `PATCH` | `/users/profile`                      | Atualiza somente o nome do perfil autenticado e ativo. |

## Administração

As rotas abaixo exigem `ADMIN` e perfil local ativo:

| Método  | Rota                | Comportamento                                              |
| ------- | ------------------- | ---------------------------------------------------------- |
| `GET`   | `/users`            | Lista perfis paginados e seus papéis efetivos no Firebase. |
| `PATCH` | `/users/:id/roles`  | Substitui o conjunto de papéis do perfil.                  |
| `PATCH` | `/users/:id/status` | Ativa ou desativa o perfil e a conta Firebase.             |

A API não permite remover ou desativar o último administrador ativo. Alterações administrativas são serializadas por um mutex local da instância da API; essa proteção reduz corridas dentro da instância, sem pretender oferecer lock distribuído. A listagem limita `perPage` a 100 e informa `authAccountExists` para distinguir perfis sem conta Firebase de contas sem papéis. Falha na consulta Firebase interrompe a operação com `503`; a contagem de administradores falha fechada.

Se a atualização do estado local falhar após a mudança no Firebase, a API tenta compensar a alteração. Se a compensação também falhar, registra `user_status_compensation_failed` com os tipos das duas falhas e retorna `503`; a equipe deve comparar o estado da conta Firebase com `User.active` e corrigir pelo fluxo administrativo antes de repetir a operação.

## Primeiro administrador

Execute `pnpm tsx scripts/create-admin.ts` manualmente no ambiente desejado. O script cria a identidade Firebase quando necessário, cria ou localiza o perfil PostgreSQL e, somente então, aplica a claim `id` e o papel `ADMIN`. Para contas Firebase existentes ele não altera senha nem remove claims existentes.
