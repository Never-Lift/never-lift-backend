# Never Lift

API REST e futuro motor de corrida autoritativo do Never Lift, construídos com Java 21 e Spring Boot. A direção aprovada usa um único monoposto e uma simulação acessível inspirada na F1 de 2026; boost/nitro não faz parte do produto.

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
| `CORS_ALLOWED_ORIGINS` | Em produção | Lista de origens explícitas, separadas por vírgula, autorizadas a acessar `/api/**`; padrão local `http://localhost:5173` |
| `CORS_ALLOWED_ORIGIN` | Não | Compatibilidade com a configuração anterior de uma única origem; usada somente quando `CORS_ALLOWED_ORIGINS` não está definida |
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

 O catálogo público `2026.12` contém as 24 definições métricas canônicas do schema de pista `2.0.0`. Cada definição usa centerline fechada suavizada e amostrada a cada aproximadamente 5 m e inclui zebras externas autorais por curva, zonas ordenadas de asfalto, grama ou brita, pit lane navegável, cercas, placas regressivas e faces explícitas das barreiras. A face voltada à pista é simultaneamente visual e física; a cerca externa e as placas permanecem apenas visuais. Muros e grades usam transições limitadas para não criar laços ou quinas. As entradas e saídas do pit são aberturas físicas publicadas no mesmo contrato, enquanto a face traseira opaca das 22 garagens (duas vagas por equipe) também possui collider, sem bloquear o corredor. Monza voltou à configuração canônica da pista principal, sem o corredor de escape provisório do Rettifilo nem abertura de barreira adicional. Os perfis guardam as fontes consultadas e são validados e importados no banco ao iniciar a aplicação; os endpoints não exigem autenticação:

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/tracks` | Versão do catálogo e metadados das 24 pistas |
| `GET` | `/api/tracks/{id}` | Definição métrica completa da pista |

Resultados de corridas simuladas localmente pelo frontend são enviados para `POST /api/races/local-result`. O endpoint aceita JWT de usuário ou guest e persiste uma linha por participante, com no máximo quatro resultados:

```json
{
  "trackId": "interlagos",
  "trackCatalogVersion": "2026.12",
  "physicsContractVersion": "2.0.0",
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

O backend exige `physicsContractVersion=2.0.0` junto do catálogo `2026.12` e persiste a versão em cada resultado; versões físicas incompatíveis não são comparadas diretamente. A Parte 2d e o Módulo 2 foram implementados e validados manualmente de forma integrada em 31/08/2026. A especificação e as fontes estão em [`docs/contracts/module-2-physics-v2-proposal.md`](docs/contracts/module-2-physics-v2-proposal.md), e a revisão atual das pistas está registrada em [`docs/module-2-track-safety-audit-2026.10.md`](docs/module-2-track-safety-audit-2026.10.md).

## Salas online — Módulo 3, Parte 3a

A infraestrutura de lobby está implementada e aguarda nova validação manual integrada em dois navegadores; o motor físico e o fluxo de corrida das Partes 3b/3c ainda não estão implementados. Somente usuários registrados podem acessar o online; o frontend mantém a vitrine visível para guests, mas bloqueada até o login. Salas são efêmeras em memória, públicas por padrão, usam código numérico de quatro dígitos e comportam de 2 a 22 carros (grid padrão 22). Não existem senhas de sala: públicas aceitam entrada direta pela listagem e privadas dependem exclusivamente do código. Entradas inválidas, código errado e sala cheia compartilham uma mensagem genérica, com no máximo cinco tentativas por minuto por usuário e origem.

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/rooms` | Cria uma sala; a interface inicial solicita somente `name` e `visibility`, usando valores padrão para corrida |
| `GET` | `/api/rooms` | Lista salas públicas ainda no lobby |
| `POST` | `/api/rooms/{code}/join` | Entra diretamente pelo código, sem corpo de senha |
| `POST` | `/api/rooms/{code}/connection-ticket` | Emite ticket opaco válido por 60 s para o usuário autenticado |
| `PATCH` | `/api/rooms/{code}/settings` | Host altera pista, grid, bots, dificuldade e visibilidade durante todo o lobby sem limpar estados de pronto |
| `POST` | `/api/rooms/{code}/ready` | Participante não-host define `ready=true/false`; a confirmação é reversível e não trava as configurações |
| `POST` | `/api/rooms/{code}/start` | Host inicia a fase de qualificação quando todos os humanos não-host estão prontos |
| `POST` | `/api/rooms/{code}/cancel-qualification` | Host cancela a classificação e retorna ao lobby enquanto ninguém começou a dirigir |
| `POST` | `/api/rooms/{code}/leave` | Host ou participante sai em qualquer fase e transfere o host automaticamente quando necessário |
| `DELETE` | `/api/rooms/{code}/players/{playerId}` | Host remove um participante enquanto a sala está no lobby |
| `POST` | `/api/rooms/{code}/close` | Host fecha a sala no lobby |

O WebSocket é `ws(s)://SEU_BACKEND/ws?ticket=...`; o ticket, e nunca o JWT, autentica o handshake. O primeiro envelope deve ser `join_room` com `roomCode`, `trackCatalogVersion=2026.12` e `physicsContractVersion=2.0.0`. Em seguida, `select_loadout`, `ready { ready }` e `ping` são aceitos; o servidor envia `room_state`, `pong` e erros. Entrada, saída, remoção, reconexão e mudanças no lobby disparam um novo `room_state` imediatamente. Heartbeat de transporte ocorre a cada 10 s, e três falhas consecutivas marcam o jogador desconectado; o mesmo ticket pode reconectar esse slot por até 30 s após a queda. Se não retornar, o participante é removido e a vaga é liberada.

## Testes

```bash
./mvnw test
```

A suíte valida o healthcheck, CORS, migrações, autenticação e conta, claims e expiração dos JWTs, hash BCrypt, autorização online-only, os 24 contratos de pista, a persistência segura de resultados locais e a Parte 3a (salas, tickets, lobby, rate limit, reconexão e heartbeat).

Com o backend rodando em `http://127.0.0.1:8080`, a validação manual de dois clientes pode ser repetida com `node tools/module-3a-smoke.mjs`. O script registra dois usuários temporários, cria e lista a sala, emite os dois tickets, conecta ambos ao `/ws`, marca o participante como pronto e confirma que o host só consegue iniciar depois disso.

## Deploy automático no Render

O `Dockerfile` na raiz é a configuração de build. O painel do Render precisa ser configurado uma vez:

1. Envie esta feature por pull request para `develop` e depois promova `develop` por pull request para `main`.
2. No Render, escolha **New > Web Service** e conecte `Never-Lift/never-lift-backend`.
3. Configure **Branch** como `main`, **Root Directory** em branco e **Runtime** como `Docker`.
4. Mantenha **Dockerfile Path** como `./Dockerfile` e ative **Auto-Deploy: On Commit**.
5. Não preencha um comando customizado de build ou start. O comando efetivo de start já está no Dockerfile: `java -jar /app/app.jar`.
6. Em **Environment**, defina `DATABASE_URL`, `DATABASE_USERNAME` e `DATABASE_PASSWORD` com os dados do Neon, `CORS_ALLOWED_ORIGINS` com as origens públicas exatas do frontend separadas por vírgula e sem barra final, e `JWT_SECRET` com um segredo aleatório exclusivo de pelo menos 32 bytes. Para validar a `develop` sem promover o frontend, use `https://never-lift-frontend.vercel.app,https://never-lift-frontend-git-develop-matheuseichendorf15s-projects.vercel.app`. A URL do banco deve estar no formato JDBC, por exemplo `jdbc:postgresql://HOST/neondb?sslmode=require`. `JWT_EXPIRATION_SECONDS` é opcional e vale `3600` por padrão. Não defina `PORT`; o Render fornece essa variável.
7. Em **Health Check Path**, use `/api/health` e crie o serviço.

Depois dessa configuração, cada atualização da `main` dispara um deploy. Quando o deploy terminar, valide `https://SEU-SERVICO.onrender.com/api/health` e confirme o HTTP 200. O serviço gratuito pode levar cerca de um minuto para despertar depois de ficar inativo.

## Documentação

Os Módulos 0–9 formam o MVP planejado. A expansão pós-MVP aprovada está registrada nos Módulos 10–16: progressão e cosméticos por conquista, contrarrelógio com fantasmas, controles personalizáveis (frontend-only), espectadores, equipes, torneios automáticos e conduta esportiva.

A direção de jogo e apresentação aprovada está em [`docs/game-design-guide.md`](docs/game-design-guide.md). Para o backend, ela é normativa somente onde define contratos compartilhados: unidade métrica, catálogo de pistas, vetor de velocidade, metadados e campos de entidades. Decisões exclusivamente visuais permanecem responsabilidade do frontend e entram apenas em seus módulos correspondentes.

Os contratos implementados pelo Módulo 2 estão em [`docs/contracts/module-2-shared-contracts.md`](docs/contracts/module-2-shared-contracts.md), [`contracts/module-2/v2/`](contracts/module-2/v2/) e na [proposta aprovada da física v2](docs/contracts/module-2-physics-v2-proposal.md). O `v1` permanece histórico e imutável. O catálogo `2026.12` contém 24 definições métricas reproduzíveis, proteções contínuas, placas de frenagem, pits navegáveis e faces canônicas de barreira; rode `node tools/track-catalog/generate-v2.mjs --check` e `node tools/track-catalog/audit-v2.mjs --mirror <pasta-v2-do-frontend>` para conferir geração, invariantes e espelho byte a byte.

- [`docs/backend-implementation-plan.md`](docs/backend-implementation-plan.md) — arquitetura, protocolo e módulos do backend.
- [`docs/frontend-implementation-plan.md`](docs/frontend-implementation-plan.md) — referência do consumidor da API e do WebSocket.
- [`docs/game-design-guide.md`](docs/game-design-guide.md) — direção compartilhada e fase de cada decisão.
- [`AGENTS.md`](AGENTS.md) — regras de arquitetura, testes e status dos módulos.
