# AGENTS.md

## O que é este projeto
Jogo de corrida 2D multiplayer (top-down, estilo drift). Existe um protótipo anterior do mesmo autor — **este é um jogo novo, não uma versão dele.** O protótipo serve só como referência de sensação/comportamento esperado, nunca como código a converter ou reaproveitar diretamente. Este repositório é o **backend**; o frontend vive num repositório separado — o contrato entre os dois está documentado abaixo e em `docs/`.

## Arquitetura (resumo — detalhe completo em `docs/plano-implementacao-backend.md`)
- Dois planos: REST (conta, social, campeonato, recordes) e tempo real (WebSocket, um socket por sala — o motor de corrida).
- O **servidor é a única autoridade** sobre a corrida: roda a física, decide colisão, valida progresso. Clientes enviam só `input` (intenção), nunca posição — isso corrige deliberadamente um bug do protótipo antigo, onde cada cliente simulava sozinho e a colisão divergia entre telas.
- Loop de simulação de passo fixo (tick), independente do FPS de qualquer cliente ou da rede.
- Stack deste repositório: Java 21 + Spring Boot 3.x. O frontend (repositório separado) usa TypeScript + React + Vite + Tailwind + shadcn/ui.
- A física existe em duas implementações — esta, autoritativa em Java, e a do frontend, em TypeScript, pra predição — que precisam ter exatamente as mesmas constantes. Qualquer divergência de sensação entre os dois lados é bug, não ajuste de tuning.

## Protocolo de tempo real (contrato com o frontend — não alterar sem avisar o outro lado)
Envelope: `{ "type": "...", "payload": {...} }`.
- Cliente → Servidor: `join_room`, `select_loadout`, `ready`, `input { throttle, brake, steer, nitro, clientSeq, clientTimestamp }`.
- Servidor → Cliente: `room_state`, `countdown`, `state_snapshot`, `race_event`, `race_result`, `error`.

Detalhe completo de cada payload: `docs/plano-implementacao-backend.md`, seção 3.

## Documentação
- `docs/plano-implementacao-backend.md` — plano deste repositório, módulo a módulo.
- `docs/plano-implementacao-frontend.md` — plano do repositório frontend, incluído aqui só como referência de quem consome esta API/WebSocket. Não implementar nada daqui.

## Stack e convenções deste repositório
- Java 21, Spring Boot 3.x (Web, WebSocket, Data JPA, Security, Validation).
- Persistência: PostgreSQL via Spring Data JPA.
- Autenticação: JWT stateless, cobre usuário logado e guest (claim `role`).
- Identificadores de código sempre em **inglês** (classes, campos, endpoints, eventos), mesmo com a documentação em português.

## Regras de arquitetura
- O motor de corrida (`RaceEngine`, Módulo 3) roda num loop de passo fixo dedicado (ex. `ScheduledExecutorService`), nunca atrelado a thread de request HTTP.
- O servidor nunca aceita posição enviada pelo cliente como verdade — só `input`. Toda física e toda decisão de colisão/checkpoint/volta acontece aqui.
- Recordes/estatísticas (Módulo 8) são calculados via query sobre `RaceResult`/`ChampionshipEntry`, não guardados numa tabela paralela.

## Regra fixa: testes
Nenhum módulo é considerado pronto sem testes automatizados rigorosos (JUnit 5 + Spring Boot Test) cobrindo suas regras de negócio, além do critério funcional descrito no plano. Vale mesmo pros módulos que parecem simples.

## Ao terminar um módulo
1. Testes automatizados passando.
2. Critério de pronto do módulo (ver `docs/plano-implementacao-backend.md`) validado manualmente.
3. Atualizar a tabela de status abaixo.
4. Commit isolado, mensagem referenciando o número do módulo.

## Status dos módulos (backend)
Antes de começar um módulo, confira se as dependências dele já estão marcadas como prontas — se não estiverem, pare e avise em vez de assumir.

| Módulo | Status |
|---|---|
| 0 — Fundação e deploy | não iniciado |
| 1 — Usuários e autenticação | não iniciado |
| 2 — Suporte a corrida local | não iniciado |
| 3 — Motor autoritativo online | não iniciado |
| 4 — Ambiente e modo caos | não iniciado |
| 5 — Corrida completa (dano/nitro/pits) | não iniciado |
| 6 — Campeonatos | não iniciado |
| 7 — Social (amigos/notificações) | não iniciado |
| 8 — Perfil, recordes e histórico | não iniciado |
| 9 — Polimento | não iniciado |

> Status do frontend (referência, não sincronizado automaticamente): ver `AGENTS.md` do repositório frontend.
