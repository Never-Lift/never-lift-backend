# Transferência de rede do Neon

## Decisão operacional

Em 08/09/2026, o projeto gratuito atingiu a franquia mensal de transferência pública do Neon. O banco ocupava aproximadamente 40 MB, mas cada chamada de listagem carregava entidades `Track` completas, incluindo cerca de 17,4 MB de geometrias JSON que não faziam parte da resposta resumida. Carregamentos de páginas, prévias de pista e reinicializações repetidas tornaram esse custo cumulativo.

A correção torna `contracts/module-2/v2/` a fonte executável e persistente das geometrias. A tabela `tracks` conserva somente metadados pequenos para validação e integridade referencial de `race_results`. A migration V5 remove `definition_json`; `GET /api/tracks` e `GET /api/tracks/{id}` leem recursos empacotados e não consultam o PostgreSQL. Um cache LRU limitado a quatro definições controla CPU e memória, e as respostas públicas usam cache HTTP.

## Migração gratuita

1. Criar um projeto Neon vazio na mesma região e versão PostgreSQL.
2. Não importar o projeto antigo: contas e resultados de teste não precisam ser preservados.
3. No Render, substituir somente `DATABASE_URL`, `DATABASE_USERNAME` e `DATABASE_PASSWORD`.
4. Preservar `JWT_SECRET` e as origens CORS.
5. Publicar primeiro esta correção; o Flyway cria o schema até V5 e o importador insere os 24 metadados.
6. Validar healthcheck, catálogo com 24 pistas, uma pista curta, uma longa, registro e login.
7. Aguardar a atualização atrasada das métricas do Neon e confirmar que recarregar o catálogo não gera dezenas de MB de egress.

O projeto antigo não deve ser apagado antes da validação. Nenhuma credencial ou URL real deve ser registrada neste documento ou no Git.
