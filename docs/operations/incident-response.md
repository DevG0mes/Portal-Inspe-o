# Resposta a incidentes

## Triagem

Registrar horário, tela/ação, status HTTP e `X-Request-Id` da resposta. Buscar o mesmo identificador nos logs JSON da API e verificar os estados de `docker compose ps`, saída do migrador e logs sanitizados do worker. Não coletar senhas, cookies, links assinados, corpo da inspeção ou arquivo `.env` em chamados. IDs de negócio e auditoria ficam em consultas autorizadas.

- API indisponível: conferir readiness PostgreSQL/Redis/MinIO, disco livre, rede e credenciais sem imprimir seus valores. Liveness isolado não prova disponibilidade dos dados.
- Worker unhealthy ou relatórios parados: conferir heartbeat, Redis, banco e armazenamento, jobs falhados e erros de configuração. Não apagar filas/volumes para tentar recuperar. O scanner recupera pendências duráveis; relatórios têm lease/tentativa protegidos. Falha final de geração exige retry autorizado ou novo pedido quando o escopo mudou.
- HTTP 429: aguardar janela/Retry-After da API e verificar tráfego abusivo. Não ampliar limites como primeira resposta. Atrás do BFF o limite da API é compartilhado; o ingresso limita IP real.
- Armazenamento: conferir bucket privado, nomes públicos/certificado, horário do servidor e Host preservado no proxy. Uma URL assinada expira em 60 s e não deve ser colada em logs. Repreparar o download pela interface.
- Falha de migração: manter a aplicação interrompida, preservar backup e volumes; comparar versão do banco com a imagem. Não executar down automático em tabelas com histórico imutável.

## Contenção e recuperação

Em suspeita de comprometimento, restringir o ingresso, desativar o usuário afetado e revogar suas sessões com administrador autorizado. Rotacionar credenciais de infraestrutura por canal protegido e reiniciar os consumidores. Uma URL já emitida permanece válida até expirar. Auditoria é append-only; não apagar registros para resolver o incidente.

Usar o procedimento de backup/restauração em projeto novo quando necessário. Reabrir o ingresso somente após health, caminho crítico, downloads privados e escopo conferidos. Registrar a versão/digests, causa, janela de impacto, dados recuperados e ações preventivas. Nenhuma implantação ou recuperação real foi feita automaticamente pelo desenvolvimento local.
