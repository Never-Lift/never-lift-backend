# Never Lift

API REST e futuro motor de corrida autoritativo do Never Lift, construídos com Java 21 e Spring Boot.

Este é um jogo novo. O protótipo anterior serve somente como referência de sensação e comportamento; ele não é uma base de código para conversão.

## Stack

- Java 21 e Spring Boot 3.5.16
- Spring Web, Data JPA, Validation e Security
- JWT stateless, BCrypt e Flyway
- PostgreSQL (Neon em produção)
- Maven Wrapper
- Docker e Render para deploy

## Executar localmente

Pré-requisito: JDK 21 com `JAVA_HOME` configurada. Não é necessário instalar Maven separadamente.

O projeto usa um banco H2 em memória somente como fallback de desenvolvimento. Antes de iniciar, copie `.env.example` para `.env` e substitua `JWT_SECRET` por um segredo aleatório com pelo menos 32 bytes:

```bash
cp .env.example .env
./mvnw spring-boot:run
```

No Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
.\mvnw.cmd spring-boot:run
```

Para desenvolver contra PostgreSQL, substitua também os valores de `DATABASE_URL`, `DATABASE_USERNAME` e `DATABASE_PASSWORD`. O arquivo `.env` é carregado automaticamente e não é versionado.

```bash
cp .env.example .env
./mvnw spring-boot:run
```

O endereço padrão é `http://localhost:8080`. Verifique a aplicação com:

```bash
curl http://localhost:8080/api/health
```

Resposta esperada:

```json
{"status":"UP","version":"0.1.0-SNAPSHOT"}
```

## Variáveis de ambiente

| Nome | Obrigatória | Descrição |
|---|---:|---|
| `DATABASE_URL` | Em produção | URL JDBC do PostgreSQL, começando por `jdbc:postgresql://` |
| `DATABASE_USERNAME` | Em produção | Usuário do PostgreSQL/Neon |
| `DATABASE_PASSWORD` | Em produção | Senha do PostgreSQL/Neon |
| `APP_VERSION` | Não | Versão exposta pelo healthcheck; por padrão usa a versão do `pom.xml` |
| `PORT` | Não | Porta HTTP; padrão local `8080` e injetada automaticamente pelo Render |
| `CORS_ALLOWED_ORIGIN` | Em produção | Origem do frontend autorizada a acessar `/api/**`; padrão local `http://localhost:5173` |
| `JWT_SECRET` | Sim | Chave usada para assinar e validar JWTs; use um valor aleatório exclusivo com pelo menos 32 bytes UTF-8 |
| `JWT_EXPIRATION_SECONDS` | Não | Validade dos JWTs em segundos; padrão `3600` (uma hora) |

Nenhuma credencial possui valor padrão no código. O H2 é usado apenas quando `DATABASE_URL` não está definida.

## Autenticação e conta

Os endpoints protegidos recebem o token no cabeçalho `Authorization: Bearer <token>`. Tokens de usuário e guest expiram em uma hora por padrão e incluem as claims `sub`, `role`, `iss`, `iat`, `exp` e `jti`. Sessões guest não criam registros no banco e não passam por endpoints anotados como online-only.

| Método | Endpoint | Corpo |
|---|---|---|
| `POST` | `/api/auth/register` | `{ "gamertag", "displayName", "password" }` |
| `POST` | `/api/auth/login` | `{ "gamertag", "password" }` |
| `POST` | `/api/auth/guest` | Sem corpo |
| `GET` | `/api/account/me` | Sem corpo |
| `PATCH` | `/api/account/me` | `{ "currentPassword", "displayName"?, "avatarId"?, "password"? }` |
| `DELETE` | `/api/account/me` | `{ "currentPassword" }` |

No `PATCH`, omitir `avatarId` preserva o avatar atual; enviar `"avatarId": null` remove o avatar da conta.

O gamertag é único e não aceita espaços. Senhas devem ter pelo menos quatro caracteres e não podem conter espaços; os demais caracteres, incluindo Unicode, são permitidos. As respostas de autenticação contêm `token`, `tokenType`, `expiresIn`, `role` e `subject`.

## Pistas e resultados locais

O catálogo público `2026.1` contém as 24 definições métricas canônicas dos contratos v1. As geometrias são validadas e importadas no banco ao iniciar a aplicação; os endpoints não exigem autenticação:

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/tracks` | Versão do catálogo e metadados das 24 pistas |
| `GET` | `/api/tracks/{id}` | Definição métrica completa da pista |

Resultados de corridas simuladas localmente pelo frontend são enviados para `POST /api/races/local-result`. O endpoint aceita JWT de usuário ou guest e persiste uma linha por participante, com no máximo quatro resultados:

```json
{
  "trackId": "interlagos",
  "trackCatalogVersion": "2026.1",
  "mode": "local",
  "results": [
    {
      "userIdOrNull": "UUID-DO-USUARIO-AUTENTICADO",
      "position": 1,
      "totalTimeMs": 185420,
      "bestLapTimeMs": 61100,
      "finished": true
    },
    {
      "userIdOrNull": null,
      "position": 2,
      "totalTimeMs": 189305,
      "bestLapTimeMs": 62450,
      "finished": true
    }
  ]
}
```

O backend valida pista, versão, modo, posições e tempos antes de persistir tudo atomicamente. Para um JWT de usuário, exatamente um item deve usar o `subject` autenticado; nenhum outro UUID é aceito. Resultados de guest e bot usam `null`. A consulta pública do histórico permanece reservada ao Módulo 8.

## Testes

```bash
./mvnw test
```

A suíte valida o healthcheck, CORS, migrações, autenticação e conta, claims e expiração dos JWTs, hash BCrypt, autorização online-only, os 24 contratos de pista e a persistência segura de resultados locais.

## Deploy automático no Render

O `Dockerfile` na raiz é a configuração de build. O painel do Render precisa ser configurado uma vez:

1. Envie esta feature por pull request para `develop` e depois promova `develop` por pull request para `main`.
2. No Render, escolha **New > Web Service** e conecte `Never-Lift/never-lift-backend`.
3. Configure **Branch** como `main`, **Root Directory** em branco e **Runtime** como `Docker`.
4. Mantenha **Dockerfile Path** como `./Dockerfile` e ative **Auto-Deploy: On Commit**.
5. Não preencha um comando customizado de build ou start. O comando efetivo de start já está no Dockerfile: `java -jar /app/app.jar`.
6. Em **Environment**, defina `DATABASE_URL`, `DATABASE_USERNAME` e `DATABASE_PASSWORD` com os dados do Neon, `CORS_ALLOWED_ORIGIN` com a origem pública exata do frontend sem barra final e `JWT_SECRET` com um segredo aleatório exclusivo de pelo menos 32 bytes. A URL do banco deve estar no formato JDBC, por exemplo `jdbc:postgresql://HOST/neondb?sslmode=require`. `JWT_EXPIRATION_SECONDS` é opcional e vale `3600` por padrão. Não defina `PORT`; o Render fornece essa variável.
7. Em **Health Check Path**, use `/api/health` e crie o serviço.

Depois dessa configuração, cada atualização da `main` dispara um deploy. Quando o deploy terminar, valide `https://SEU-SERVICO.onrender.com/api/health` e confirme o HTTP 200. O serviço gratuito pode levar cerca de um minuto para despertar depois de ficar inativo.

## Documentação

Os Módulos 0–9 formam o MVP planejado. A expansão pós-MVP aprovada está registrada nos Módulos 10–16: progressão e carros por conquista, contrarrelógio com fantasmas, controles personalizáveis (frontend-only), espectadores, equipes, torneios automáticos e conduta esportiva.

A direção de jogo e apresentação aprovada está em [`docs/game-design-guide.md`](docs/game-design-guide.md). Para o backend, ela é normativa somente onde define contratos compartilhados: unidade métrica, catálogo de pistas, vetor de velocidade, metadados e campos de entidades. Decisões exclusivamente visuais permanecem responsabilidade do frontend e entram apenas em seus módulos correspondentes.

Os contratos implementados pelo Módulo 2 estão em [`docs/contracts/module-2-shared-contracts.md`](docs/contracts/module-2-shared-contracts.md) e [`contracts/module-2/v1/`](contracts/module-2/v1/). O catálogo `2026.1` contém 24 definições métricas reproduzíveis; rode `node tools/track-catalog/generate.mjs --check` para conferir que os arquivos gerados continuam sincronizados com a fonte versionada.

- [`docs/backend-implementation-plan.md`](docs/backend-implementation-plan.md) — arquitetura, protocolo e módulos do backend.
- [`docs/frontend-implementation-plan.md`](docs/frontend-implementation-plan.md) — referência do consumidor da API e do WebSocket.
- [`docs/game-design-guide.md`](docs/game-design-guide.md) — direção compartilhada e fase de cada decisão.
- [`AGENTS.md`](AGENTS.md) — regras de arquitetura, testes e status dos módulos.
