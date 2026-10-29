# Backup e restauração

O backup contém respostas, auditoria, hashes de credenciais, evidências e relatórios privados. Guardar em diretório com ACL restrita, volume criptografado e cópia externa protegida; não colocar em pasta pública ou Git. Os scripts exigem PowerShell 7 e Docker local. Eles não enviam dados a serviços externos.

## Backup consistente

O procedimento abre uma janela de manutenção: para os serviços que estavam ativos entre ingresso/web/API/worker/Redis/MinIO, espera encerramento de até 120 s, faz dump PostgreSQL custom e arquiva o volume MinIO parado. PostgreSQL continua ativo, sem escritores da aplicação. Não fazer gravações administrativas diretas durante a janela. O `finally` retoma somente os serviços antes ativos; conferir health depois, inclusive em caso de erro.

```powershell
./infra/scripts/backup.ps1 -ProjectName portal-production `
  -ComposeFile infra/compose.production.yaml `
  -EnvironmentFile /srv/portal/production.env `
  -OutputDirectory /backups/portal/2026-10-29T230000
```

O destino deve ser novo. `database.dump` é copiado como bytes, sem pipeline textual do PowerShell. `storage.tar` preserva dados/metadados e `storage.sha256` registra todos os arquivos. `manifest.json` registra imagens, contagens de todas as tabelas públicas e SHA-256 dos três arquivos. O manifesto só é publicado após os arquivos completos. Falhas deixam o diretório para diagnóstico, sem marcar backup como completo.

Redis não faz parte do conjunto: filas/schedulers são reconstruídos pelo worker, e recorrências, notificações, evidências e relatórios têm estado/idempotência duráveis no PostgreSQL. Um relatório PROCESSING pode aguardar expiração do lease de 15 minutos antes da recuperação. Sessões ficam no PostgreSQL. Preservar o arquivo de configuração/secrets e certificado em cofre separado; não são incluídos no backup.

## Prova de restauração

```powershell
./infra/scripts/restore-check.ps1 -BackupDirectory /backups/portal/2026-10-29T230000
```

O script verifica os hashes, cria PostgreSQL e volume novos com prefixo aleatório `portal-restore-`, sem rede/portas publicadas, importa com `pg_restore --exit-on-error`, compara o conjunto/contagem de tabelas e restaura/confere todos os hashes do armazenamento. Não aceita um banco/volume de destino existente. Remove apenas recursos criados pela execução, após conferir a etiqueta de propriedade. Não extrai arquivos do tar no host. Usar somente backups confiáveis: hashes detectam corrupção, não autenticam um manifesto fornecido por terceiros.

## Recuperação real

1. Isolar o incidente, suspender escritores e preservar os volumes afetados para diagnóstico. Não restaurar por cima deles.
2. Verificar o backup com `restore-check.ps1`, confirmar a data e as imagens compatíveis.
3. Criar outro projeto e volumes novos no servidor de recuperação. Importar o dump com usuário proprietário apropriado e `--no-owner --no-acl`; extrair o arquivo de armazenamento apenas no novo volume, preservando donos/permissões. Usar a mesma imagem MinIO da captura antes de qualquer atualização.
4. Subir Redis vazio, migração compatível, API, worker, web e ingresso; conferir health, estrutura, inspeção com evidência histórica, PDF/Excel, assinaturas e escopo. Confirmar recuperação dos trabalhos pendentes antes de liberar usuários.
5. Somente depois da conferência, alterar DNS/ingresso. Manter o conjunto anterior até decisão formal de retenção. Este procedimento não automatiza descarte nem sobrescrita de produção.

Programar o script no agendador corporativo durante janela aprovada, diariamente como ponto inicial, e testar restauração ao menos mensalmente e após alterações de infraestrutura/schema. Frequência e retenção devem ser aprovadas pela operação. RPO é o intervalo desde o último backup válido; RTO depende do volume e da homologação de recuperação. Não há RPO/RTO de produção medido neste projeto local.
