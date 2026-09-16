# M3c — isolamento do banco durante a corrida

Revisão motivada pelo vídeo do autor em Suzuka, dois humanos e um bot, após
frontend #141. Branch `codex/module-3c-online-stall`, base develop `ed4134e`.
O Módulo 3 continua aguardando validação integrada/manual; não promover main.

## Falhas reproduzidas e correções

- `RoomManager.get()` e `listPublic()` tinham `@Transactional(readOnly=true)`
  mesmo acessando apenas salas em memória. O proxy Spring abria uma transação
  a cada consulta, inclusive nas rotas frequentes de input/publicação. Teste
  antes da correção: **101 transações para 100 consultas e uma listagem**.
- As anotações foram removidas desses dois métodos. Depois: **zero transações,
  zero aquisições JDBC, zero statements**. Consultas necessárias na criação,
  autenticação e gravação transacional do resultado permanecem preservadas.
- A saída do último humano deixando bots causava NPE ao consultar host nulo,
  atingindo REST e publicação. `participantForUser(null)` agora retorna ausência,
  nunca um bot. O teste integrado revelou e cobriu esse caso.

Não houve migration, alteração de dados/credenciais, tuning físico, redução de
ticks/snapshots ou mudança de protocolo. A física continua 2.0.3, 120 Hz; tick
30 Hz e publicação 20 Hz. Fórmulas, geometrias e artefatos compartilhados intactos.

## Evidências

- `RoomRealtimeStorageTest` usa o Spring/JPA real e estatísticas Hibernate;
  instanciação direta sem proxy esconderia a transação indevida.
- Teste com o pool H2 suspenso comprova consultas de sala funcionando sem JDBC.
- `AuthoritativeRaceIntegrationTest` adicionou dois clientes reais HTTP/WebSocket,
  Suzuka e um bot: após a contagem, suspende o pool, envia comandos a 30 Hz e
  verifica novos snapshots para ambos, ACK >= 50, movimento e ausência de erros.
  O pool é restaurado em `finally`; teste não usa Neon nem contas de produção.
- Suíte completa intermediária: 132 testes, zero falhas/erros, um diagnóstico
  opcional ignorado. Após adicionar regressões integradas e host nulo, o grupo
  focal de armazenamento/gerenciador/transporte também passou.
- Chrome real com frontend revisado e H2 isolado: dois humanos e um bot em
  Suzuka, atraso artificial de 80 ms por sentido, frenagem, pulsos de direção,
  reconexão e Esc. Zero pageerrors; relógio local próximo de 100% do tempo real.
  Não substitui a validação no Render nem comprova FPS mínimo universal.

## Frontend coordenado

O frontend corrigiu descarte de comandos ainda não confirmados pela autoridade,
mantendo horizonte estável e sem repetir controles superados pelo ACK. Um teste
reproduziu esterço previsto de 0,1 sendo zerado por snapshot com ACK -1. Também
adicionou aviso temporário de atraso de snapshots e diagnósticos limitados de
entrega (não são ping/RTT). Não houve mudança no contrato de rede.

## Publicação

Gate final: **134 testes**, zero falhas/erros, um diagnóstico opcional ignorado.
O repackage inicialmente falhou porque o JAR estava aberto no servidor H2 local.
Após nova autorização do autor, a identidade do processo foi conferida, somente
o servidor de diagnóstico foi encerrado e `./mvnw.cmd -DskipTests package` passou.
O bloqueio temporário da aprovação não foi contornado. Branch de entrega:
`codex/module-3c-online-stall`, baseada no develop atualizado.
Frontend coordenado: 474 testes/55 arquivos, lint e build aprovados.

PR independente para develop, sem merge automático. Atualizar o backend Render
para esta revisão e usar a preview frontend correspondente. Repetir Suzuka com
as mesmas máquinas antes da validação completa de quali, corrida e pódio.
O custo/latência reais do Neon/Render durante a gravação não foram medidos:
o defeito de acoplamento foi provado, não que ele explica sozinho todo solavanco.

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-22'
./mvnw.cmd '-DargLine=-Djdk.net.unixdomain.tmpdir=C:\Windows\Temp' test
```

O parâmetro de diretório temporário resolve somente sockets loopback do Java
nesta máquina Windows. Não é configuração necessária de deploy no Render.
