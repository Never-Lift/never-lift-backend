# Never Lift

API REST + motor de corrida autoritativo (Java/Spring Boot) do Never Lift.

Este é um **jogo novo**. Existe um protótipo anterior (mesmo conceito, feito com uma arquitetura de rede sem autoridade nenhuma) — ele serve só como referência de sensação e comportamento esperado do jogo, não como base de código.

## Stack

- Java 21 (LTS) + Spring Boot 3.x
- PostgreSQL (Neon em produção)
- WebSocket para o motor de corrida em tempo real, REST para conta/social/recordes
- Deploy: Render (Web Service, tier free)

## Documentação

- [`docs/plano-implementacao-backend.md`](docs/plano-implementacao-backend.md) — arquitetura completa, protocolo de tempo real, modelo de dados e todos os módulos. Leia antes de começar qualquer módulo.
- [`AGENTS.md`](AGENTS.md) — resumo de convenções pro Codex (e pra qualquer humano entrando no projeto).

## Rodando localmente

Pré-requisitos: JDK 21, o wrapper `./mvnw` (incluso no repo), acesso a um Postgres (Neon ou local via Docker).

```bash
cp .env.example .env   # preencher DATABASE_URL e JWT_SECRET
./mvnw spring-boot:run
```

API sobe em `http://localhost:8080`. Healthcheck: `GET /api/health`.

## Variáveis de ambiente

| Nome | Descrição |
|---|---|
| `DATABASE_URL` | connection string do Postgres |
| `JWT_SECRET` | segredo usado pra assinar os tokens de autenticação |
| `CORS_ALLOWED_ORIGIN` | URL do frontend em produção, pra liberar CORS |

## Testes

```bash
./mvnw test
```

Nenhum módulo do plano de implementação é considerado pronto sem testes automatizados cobrindo suas regras de negócio (ver seção 5 do plano) — não é opcional.

## Estrutura sugerida

```
src/main/java/.../
  auth/           # Módulo 1 — usuários e autenticação
  race/           # Módulos 2-3-4-5 — motor local, autoritativo online, ambiente, dano/nitro/pits
  championship/   # Módulo 6
  social/         # Módulo 7 — amigos e notificações
  profile/        # Módulo 8 — estatísticas, recordes, histórico
```

## Deploy

Push na branch principal aciona deploy automático no Render. O serviço free hiberna após 15 min sem tráfego (~1 min pra acordar na próxima conexão) — normal, não é bug.
