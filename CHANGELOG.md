# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) e o projeto utiliza [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Added

- Adicionado onboarding de usuários com códigos de verificação temporários armazenados com hash no Redis, limite de tentativas e suporte à criação de perfis autenticados pelo Firebase.
- Adicionado suporte obrigatório ao Redis na configuração, readiness, CI e deploy da API.
- Adicionado suporte opcional a mTLS OTLP/gRPC pelas variáveis padrão de certificado e chave cliente do OpenTelemetry.
- Adicionada injeção de credenciais TLS OTLP como secrets de runtime no deploy Podman.
- Adicionado workflow de release com Semantic Versioning.
- Adicionado acompanhamento de releases com Keep a Changelog.
- Adicionado check estrutural para a documentação canônica.
- Adicionado relatório informativo de tamanho ao build da imagem OCI.
- Adicionadas traduções em inglês e espanhol das mensagens da API, escolhidas por `x-custom-lang`, `?lang` ou `Accept-Language`; variantes regionais como `en-US` e `pt-PT` usam o idioma suportado correspondente.
- Adicionado teste que falha quando um idioma não tem os mesmos arquivos, chaves e placeholders do pt-BR.

### Changed

- Códigos de verificação deixaram de ser persistidos no PostgreSQL e passaram a usar Redis diretamente com `ioredis`.
- Melhorada a telemetria da API com access logs estruturados, correlação entre logs e traces, métricas operacionais e redaction de dados sensíveis.
- Reestruturada a documentação canônica do template.
- Separada a criação imutável de releases do deploy em GitHub Environments.
- Otimizado o contexto de build OCI e a separação de suas etapas.
- Adicionada limpeza segura de imagens dangling da aplicação após deploy bem-sucedido.
- O deploy passou a usar uma única imagem OCI para runtime e migrations.
- `main` passou a ser a única branch de integração.
- Runtime e código-fonte passaram a usar ECMAScript Modules nativo.
- A configuração TypeScript foi simplificada para NodeNext.
- As suítes de teste foram migradas de Jest para Vitest.
- Atualizados Node.js para 24.21.0 e pnpm para 12.3.4.
- `scripts/create-admin.ts` passou a aceitar telefone opcional no formato internacional E.164, em vez de assumir o código do Brasil.

### Removed

- Removida a imagem OCI separada para migrations.
- Removido o deploy automático a partir de uma branch de integração.

### Fixed

- O deploy passou a resolver o nome da imagem no GHCR em minúsculas, como o build, evitando falha no pull em repositórios com letras maiúsculas no nome.
