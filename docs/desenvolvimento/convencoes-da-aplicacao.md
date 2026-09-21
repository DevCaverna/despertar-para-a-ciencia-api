# Convenções da aplicação

Este documento cobre convenções próprias do template; NestJS, controllers, providers e injeção de dependência seguem a documentação do framework.

## Endpoints

Use `@Public()` somente quando a rota puder ser acessada sem token. Use `@Roles(...)` para autorizar roles e `@Actor()` quando a implementação precisar do ator autenticado.

## Banco de dados

Não acesse `pg.Pool` diretamente fora da infraestrutura Prisma. Para alterar o schema, siga [Migrations do banco](migracoes-do-banco.md).

## Integrações externas

Uma integração merece port e adapter quando a aplicação depende de um serviço externo ou quando a implementação precisa ser substituível em testes e ambientes. Mantenha a porta independente das entidades da aplicação quando o provider não precisa conhecê-las; `AuthPort`, por exemplo, não depende de `User`.

Não crie abstrações apenas por simetria. Uma dependência interna simples e estável pode ser usada diretamente.
