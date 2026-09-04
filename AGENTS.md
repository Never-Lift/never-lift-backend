# AGENTS.md

## O que é este projeto
Jogo de corrida 2D multiplayer top-down, com simulação acessível de um monoposto inspirado na F1 de 2026 e um único modelo de carro. A condução é exigente e fisicamente coerente (`simcade`), enquanto os efeitos visuais arcade permanecem controlados. Existe um protótipo anterior do mesmo autor — **este é um jogo novo, não uma versão dele.** O protótipo serve só como referência de sensação/comportamento esperado, nunca como código a converter ou reaproveitar diretamente. Este repositório é o **backend**; o frontend vive num repositório separado — o contrato entre os dois está documentado abaixo e em `docs/`.

## Arquitetura (resumo — detalhe completo em `docs/backend-implementation-plan.md`)
- Dois planos: REST (conta, social, campeonato, recordes) e tempo real (WebSocket, um socket por sala — o motor de corrida).
- O **servidor é a única autoridade** sobre a corrida: roda a física, decide colisão, valida progresso. Clientes enviam só `input` (intenção), nunca posição — isso corrige deliberadamente um bug do protótipo antigo, onde cada cliente simulava sozinho e a colisão divergia entre telas.
- Loop de simulação de passo fixo (tick), independente do FPS de qualquer cliente ou da rede.
- Stack deste repositório: Java 21 + Spring Boot 3.x. O frontend (repositório separado) usa TypeScript + React + Vite + Tailwind + shadcn/ui.
- A física existe em duas implementações — esta, autoritativa em Java, e a do frontend, em TypeScript, pra predição — que precisam ter exatamente as mesmas fórmulas, ordem de integração, constantes e cenários de referência. Qualquer divergência de sensação entre os dois lados é bug, não ajuste de tuning.

## Protocolo de tempo real (contrato com o frontend — não alterar sem avisar o outro lado)
Envelope: `{ "type": "...", "payload": {...} }`.
- Cliente → Servidor: `join_room { roomCode, trackCatalogVersion, physicsContractVersion }`, `select_loadout`, `ready { ready }`, `input { throttle, brake, steer, clientSeq, clientTimestamp }`.
- Servidor → Cliente: `room_state`, `countdown`, `state_snapshot`, `race_event`, `race_result`, `error`.

Detalhe completo de cada payload: `docs/backend-implementation-plan.md`, seção 3.

## Documentação
- `docs/backend-implementation-plan.md` — plano deste repositório, módulo a módulo.
- `docs/frontend-implementation-plan.md` — plano do repositório frontend, incluído aqui só como referência de quem consome esta API/WebSocket. Não implementar nada daqui.
- `docs/game-design-guide.md` — fonte compartilhada das decisões de jogo e apresentação. O backend implementa somente unidades, metadados e contratos explicitamente atribuídos a ele.
- `docs/module-3b-authoritative-physics.md` — entrega da Parte 3b, paridade, snapshot completo e limites em relação à 3c.
- `docs/module-3b-portability.md` — revisão aprovada 2.0.3, kernel numérico compartilhado, evidências e teste manual curto antes da 3c.
- `docs/module-3-online-decisions.md` — registro aprovado das 80 decisões de produto e arquitetura para o online; manter sincronizado com o plano do frontend antes de implementar o Módulo 3.
- `docs/contracts/module-2-shared-contracts.md`, `docs/contracts/module-2-physics-v2-proposal.md` e `contracts/module-2/v1/`/`v2/` — decisões e contratos publicados do Módulo 2. O `v1` é histórico imutável; o `v2` é a linha executável da Parte 2d.

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
- As 24 definições geradas em `contracts/module-2/v2/tracks/` são a fonte canônica do runtime atual, com catálogo próprio e faces canônicas de barreira. O `v1` permanece histórico; não redesenhar pistas na migration nem misturar versões.
- No contrato v2, boost/nitro não existe e `Shift` fica sem função: input, protocolo e testes não carregam a reserva histórica do v1.3.

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
| 2 — Suporte a corrida local | pronto — catálogo `2026.12` e contrato físico `2.0.0` validados manualmente de forma integrada em 31/08/2026; calibração de dano/direção `2.0.1` e correção aprovada de delta-v normal `2.0.2` sincronizadas e cobertas por testes, com confirmação manual pendente; persistência versionada e artefatos compartilhados prontos; simplificação para F1 único concluída; zebras autorais, proteções contínuas, placas métricas por curva, largada de Silverstone reposicionada na reta oficial, Marina Bay orientada no sentido anti-horário, aberturas físicas de entrada/saída do pit e 22 vagas visuais opacas por circuito, com face traseira das garagens publicada como collider; escape provisório do Rettifilo de Monza removido e proteção canônica restaurada. Parte 2d e Módulo 2 prontos |
| 3 — Motor autoritativo online | Parte 3a pronta e validada manualmente em 03/09/2026; Parte 3b Java implementada, com validação manual básica confirmada pelo autor; revisão de portabilidade 2.0.3 autorizada e coberta por paridade Java/TypeScript/navegadores, validada manualmente pelo autor em 04/09/2026. Compatibilidade do frontend sincronizada; 3c (classificação, fluxo de corrida e predição/reconciliação online) pendente |
| 4 — Ambiente e modo caos | não iniciado |
| 5 — Corrida completa (dano/vácuo/pits) | não iniciado |
| 6 — Campeonatos | não iniciado |
| 7 — Social (amigos/notificações) | não iniciado |
| 8 — Perfil, recordes e histórico | não iniciado |
| 9 — Polimento | não iniciado |
| 10 — Progressão, personalização e medalhas | não iniciado (pós-MVP) |
| 11 — Contrarrelógio e fantasmas | não iniciado (pós-MVP) |
| 12 — Controles personalizáveis | não aplicável (frontend) |
| 13 — Modo espectador para amigos | não iniciado (pós-MVP) |
| 14 — Equipes e placar coletivo | não iniciado (pós-MVP) |
| 15 — Torneios oficiais automáticos | não iniciado (pós-MVP) |
| 16 — Conduta esportiva e penalidades | não iniciado (pós-MVP) |

> Status do frontend (referência, não sincronizado automaticamente): ver `AGENTS.md` do repositório frontend.
