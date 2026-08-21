# AGENTS.md

## O que é este projeto
Jogo de corrida 2D multiplayer (top-down, estilo drift). Existe um protótipo anterior do mesmo autor — **este é um jogo novo, não uma versão dele.** O protótipo serve só como referência de sensação/comportamento esperado, nunca como código a converter ou reaproveitar diretamente. Este repositório é o **backend**; o frontend vive num repositório separado — o contrato entre os dois está documentado abaixo e em `docs/`.

## Arquitetura (resumo — detalhe completo em `docs/backend-implementation-plan.md`)
- Dois planos: REST (conta, social, campeonato, recordes) e tempo real (WebSocket, um socket por sala — o motor de corrida).
- O **servidor é a única autoridade** sobre a corrida: roda a física, decide colisão, valida progresso. Clientes enviam só `input` (intenção), nunca posição — isso corrige deliberadamente um bug do protótipo antigo, onde cada cliente simulava sozinho e a colisão divergia entre telas.
- Loop de simulação de passo fixo (tick), independente do FPS de qualquer cliente ou da rede.
- Stack deste repositório: Java 21 + Spring Boot 3.x. O frontend (repositório separado) usa TypeScript + React + Vite + Tailwind + shadcn/ui.
- A física existe em duas implementações — esta, autoritativa em Java, e a do frontend, em TypeScript, pra predição — que precisam ter exatamente as mesmas constantes. Qualquer divergência de sensação entre os dois lados é bug, não ajuste de tuning.

## Protocolo de tempo real (contrato com o frontend — não alterar sem avisar o outro lado)
Envelope: `{ "type": "...", "payload": {...} }`.
- Cliente → Servidor: `join_room { roomCode, trackCatalogVersion }`, `select_loadout`, `ready`, `input { throttle, brake, steer, nitro, clientSeq, clientTimestamp }`.
- Servidor → Cliente: `room_state`, `countdown`, `state_snapshot`, `race_event`, `race_result`, `error`.

Detalhe completo de cada payload: `docs/backend-implementation-plan.md`, seção 3.

## Documentação
- `docs/backend-implementation-plan.md` — plano deste repositório, módulo a módulo.
- `docs/frontend-implementation-plan.md` — plano do repositório frontend, incluído aqui só como referência de quem consome esta API/WebSocket. Não implementar nada daqui.
- `docs/game-design-guide.md` — fonte compartilhada das decisões de jogo e apresentação. O backend implementa somente unidades, metadados e contratos explicitamente atribuídos a ele.
- `docs/contracts/module-2-shared-contracts.md` e `contracts/module-2/v1/` — contratos versionados, catálogo `2026.3`, geometrias canônicas e constantes compartilhadas que o Módulo 2 deve transformar em API e persistência.

## Stack e convenções deste repositório
- Java 21, Spring Boot 3.x (Web, WebSocket, Data JPA, Security, Validation).
- Persistência: PostgreSQL via Spring Data JPA.
- Autenticação: JWT stateless, cobre usuário logado e guest (claim `role`).
- Identificadores de código sempre em **inglês** (classes, campos, endpoints, eventos), mesmo com a documentação em português.

## Regras de arquitetura
- O motor de corrida (`RaceEngine`, Módulo 3) roda num loop de passo fixo dedicado (ex. `ScheduledExecutorService`), nunca atrelado a thread de request HTTP.
- O servidor nunca aceita posição enviada pelo cliente como verdade — só `input`. Toda física e toda decisão de colisão/checkpoint/volta acontece aqui.
- Recordes/estatísticas (Módulo 8) são calculados via query sobre `RaceResult`/`ChampionshipEntry`, não guardados numa tabela paralela.
- Física, pistas, checkpoints e snapshots usam **1 unidade de mundo = 1 metro**, velocidades em metros por segundo e ângulos na convenção compartilhada do plano. Pixels e escala de câmera nunca entram no domínio do backend.
- O catálogo de pistas é versionado. Uma sala fixa `trackId` e `trackCatalogVersion`; nunca simular clientes com geometrias divergentes.
- As 24 definições geradas em `contracts/module-2/v1/tracks/` são a fonte canônica da geometria. Não redesenhar pistas na migration; importar/serializar os mesmos dados e manter compatibilidade com os schemas compartilhados.

## Regra fixa: design e fase
- `docs/game-design-guide.md` registra decisões globais e futuras, mas não autoriza antecipar entidades ou endpoints pós-MVP.
- Implementar somente os contratos de backend atribuídos ao módulo em andamento. Câmera, layout, partículas e renderização pertencem ao frontend.
- Alterações compartilhadas de unidade, pista, física ou protocolo precisam ser sincronizadas nos dois planos e nos dois repositórios no mesmo trabalho.

## Regra fixa: testes
Nenhum módulo é considerado pronto sem testes automatizados rigorosos (JUnit 5 + Spring Boot Test) cobrindo suas regras de negócio, além do critério funcional descrito no plano. Vale mesmo pros módulos que parecem simples.

## Ao terminar um módulo
1. Testes automatizados passando.
2. Critério de pronto do módulo (ver `docs/backend-implementation-plan.md`) validado manualmente.
3. Atualizar a tabela de status abaixo.
4. Commit isolado, mensagem referenciando o número do módulo.

Promoções `develop → main` devem preservar a ancestralidade com merge commit. Se alguém usar squash, sincronizar `main` de volta em `develop` antes de iniciar o módulo seguinte.

## Status dos módulos (backend)
Antes de começar um módulo, confira se as dependências dele já estão marcadas como prontas — se não estiverem, pare e avise em vez de assumir.

| Módulo | Status |
|---|---|
| 0 — Fundação e deploy | pronto |
| 1 — Usuários e autenticação | pronto |
| 2 — Suporte a corrida local | pronto — catálogo auditado `2026.3`/schema `1.2.0` com superfícies e proteções por pista; revalidação visual integrada concluída em 21/08/2026 |
| 3 — Motor autoritativo online | não iniciado |
| 4 — Ambiente e modo caos | não iniciado |
| 5 — Corrida completa (dano/nitro/pits) | não iniciado |
| 6 — Campeonatos | não iniciado |
| 7 — Social (amigos/notificações) | não iniciado |
| 8 — Perfil, recordes e histórico | não iniciado |
| 9 — Polimento | não iniciado |
| 10 — Progressão, carros e medalhas | não iniciado (pós-MVP) |
| 11 — Contrarrelógio e fantasmas | não iniciado (pós-MVP) |
| 12 — Controles personalizáveis | não aplicável (frontend) |
| 13 — Modo espectador para amigos | não iniciado (pós-MVP) |
| 14 — Equipes e placar coletivo | não iniciado (pós-MVP) |
| 15 — Torneios oficiais automáticos | não iniciado (pós-MVP) |
| 16 — Conduta esportiva e penalidades | não iniciado (pós-MVP) |

> Status do frontend (referência, não sincronizado automaticamente): ver `AGENTS.md` do repositório frontend.
