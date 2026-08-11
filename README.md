# Never Lift

API REST e futuro motor de corrida autoritativo do Never Lift, construídos com Java 21 e Spring Boot.

Este é um jogo novo. O protótipo anterior serve somente como referência de sensação e comportamento; ele não é uma base de código para conversão.

## Stack do Módulo 0

- Java 21 e Spring Boot 3.5.16
- Spring Web, Data JPA e Validation
- PostgreSQL (Neon em produção)
- Maven Wrapper
- Docker e Render para deploy

## Executar localmente

Pré-requisito: JDK 21 com `JAVA_HOME` configurada. Não é necessário instalar Maven separadamente.

O projeto usa um banco H2 em memória somente como fallback de desenvolvimento, então a fundação e o healthcheck sobem sem configuração externa:

```bash
./mvnw spring-boot:run
```

No Windows PowerShell, use:

```powershell
.\mvnw.cmd spring-boot:run
```

Para desenvolver contra PostgreSQL, copie `.env.example` para `.env`, substitua os valores e execute o mesmo comando. O arquivo `.env` é carregado automaticamente e não é versionado.

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

Nenhuma credencial possui valor padrão no código. O H2 é usado apenas quando `DATABASE_URL` não está definida.

## Testes

```bash
./mvnw test
```

A suíte inclui um teste de integração do `GET /api/health`, validando HTTP 200 e os campos `status` e `version`.

## Deploy automático no Render

O `Dockerfile` na raiz é a configuração de build. O painel do Render precisa ser configurado uma vez:

1. Envie esta feature por pull request para `develop` e depois promova `develop` por pull request para `main`.
2. No Render, escolha **New > Web Service** e conecte `Never-Lift/never-lift-backend`.
3. Configure **Branch** como `main`, **Root Directory** em branco e **Runtime** como `Docker`.
4. Mantenha **Dockerfile Path** como `./Dockerfile` e ative **Auto-Deploy: On Commit**.
5. Não preencha um comando customizado de build ou start. O comando efetivo de start já está no Dockerfile: `java -jar /app/app.jar`.
6. Em **Environment**, defina `DATABASE_URL`, `DATABASE_USERNAME` e `DATABASE_PASSWORD` com os dados do Neon e `CORS_ALLOWED_ORIGIN` com a origem pública exata do frontend, sem barra final. A URL do banco deve estar no formato JDBC, por exemplo `jdbc:postgresql://HOST/neondb?sslmode=require`. Não defina `PORT`; o Render fornece essa variável.
7. Em **Health Check Path**, use `/api/health` e crie o serviço.

Depois dessa configuração, cada atualização da `main` dispara um deploy. Quando o deploy terminar, valide `https://SEU-SERVICO.onrender.com/api/health` e confirme o HTTP 200. O serviço gratuito pode levar cerca de um minuto para despertar depois de ficar inativo.

## Documentação

- [`docs/backend-implementation-plan.md`](docs/backend-implementation-plan.md) — arquitetura, protocolo e módulos do backend.
- [`docs/frontend-implementation-plan.md`](docs/frontend-implementation-plan.md) — referência do consumidor da API e do WebSocket.
- [`AGENTS.md`](AGENTS.md) — regras de arquitetura, testes e status dos módulos.
