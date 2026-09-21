# Telemetria

A API emite logs estruturados, traces e métricas por OpenTelemetry. Este documento descreve somente os sinais produzidos pela aplicação; armazenamento, dashboards, alertas e retenção pertencem à infraestrutura de observabilidade.

## Sinais

Requests normais geram access logs JSON com `request.id`, `http.request.method`, `http.route`, `http.response.status_code` e `duration_ms`. A rota é normalizada quando o framework a resolve; rotas desconhecidas usam `[unknown]`.

Traces HTTP são gerados pela instrumentação automática. Operações lógicas de Firebase, Brevo e R2 criam spans filhos com `dependency`, `operation` e `result`. PostgreSQL usa os spans do middleware Prisma, sem instrumentação automática adicional de `pg`.

Métricas customizadas usam somente dimensões controladas:

- `application.dependency.operation.duration`: `dependency`, `operation` e `result`;
- `database.client.operation.duration`: `operation` e `result`;
- `application.readiness.duration`: `result`.

## Correlação

O Pino HTTP cria ou valida `X-Request-Id` com no máximo 64 caracteres seguros e o devolve na resposta. O OpenTelemetry injeta automaticamente `trace_id`, `span_id` e `trace_flags` nos logs quando existe um span ativo. A aplicação não cria IDs paralelos para essa correlação.

## Dados protegidos

Payloads de request e response não são dados de observabilidade. Authorization, cookies, tokens, senhas, chaves privadas e segredos são redacted como barreira adicional. E-mails de destinatários, IDs de usuários e valores de parâmetros SQL não são atributos de telemetria.

## Health checks

`GET /health/live` não gera access log nem trace HTTP. Sucessos de `GET /health/ready` não geram access log; a verificação PostgreSQL continua produzindo trace e métrica. Falhas de readiness respondem `{ "status": "error" }` e emitem `readiness_failed` com `error.type` e dependência `postgresql`.

## Recursos e configuração

Quando exportado, cada sinal identifica `service.name`, `service.version` e `deployment.environment.name`. O deploy define os dois últimos em `OTEL_RESOURCE_ATTRIBUTES` usando o SHA da imagem e o GitHub Environment. `OTEL_SERVICE_NAME` continua definindo `service.name`.

Sem `OTEL_EXPORTER_OTLP_ENDPOINT`, a aplicação funciona normalmente e a exportação fica desabilitada. Indisponibilidade do backend OTLP não deve impedir startup, requests ou health checks. A configuração permanece vendor-neutral e usa somente variáveis `OTEL_*`.

## Transporte seguro

OTLP/gRPC pode usar TLS pelo endpoint HTTPS e, opcionalmente, mTLS com `OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE` e `OTEL_EXPORTER_OTLP_CLIENT_KEY`. Essas variáveis são paths para arquivos PEM, devem ser configuradas juntas e podem ser injetadas como secrets somente em runtime. Certificados e chaves privadas não pertencem à imagem OCI, ao `runtime.env` como conteúdo ou ao source control.
