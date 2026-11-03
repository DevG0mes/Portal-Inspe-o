# Plano de deploy gratuito para homologação

Para a demonstração com inspeções avulsas e indicadores, seguir o [piloto Supabase e Render](render-pilot.md). Este plano cobre a alternativa de hospedar a pilha completa em uma VM gratuita.

Usar uma VM Ubuntu ARM da Oracle Cloud Always Free, se houver capacidade na região da conta. Reservar inicialmente até 2 OCPUs e 12 GB de RAM dentro da franquia. Conferir os limites no console antes de provisionar. A Oracle pode recuperar VMs ociosas. [Regras Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

O Compose de produção já reúne ingresso HTTPS, Next.js, API, worker, PostgreSQL, Redis e MinIO. Uma VM permite validar o conjunto, inclusive agendamentos e geração de PDF/Excel. O Render gratuito tem PostgreSQL com expiração de 30 dias e não oferece worker gratuito. [Limites do Render](https://render.com/docs/free) · [Workers no Render](https://render.com/docs/migrate-from-heroku)

| Componente              | Hospedagem proposta para o piloto                   |
| ----------------------- | --------------------------------------------------- |
| Front-end Next.js       | Container `web` na VM, acessado pelo ingresso HTTPS |
| Back-end NestJS         | Container `api` na rede privada do Compose          |
| PostgreSQL              | Container `postgres` com volume persistente na VM   |
| Worker, fila e arquivos | Containers `worker`, `redis` e `minio` na mesma VM  |

O front-end encaminha as chamadas ao back-end pela rede do Compose. Os downloads assinados usam o segundo nome HTTPS previsto no ingresso. O plano Hobby da Vercel é voltado ao uso pessoal e não comercial. [Limites do Hobby](https://vercel.com/docs/plans/hobby)

Para reproduzir a verificação das imagens em PowerShell com Docker Desktop, usar um projeto de validação e o arquivo de exemplo apenas na fase de build.

```powershell
$env:DOCKER_DEFAULT_PLATFORM = 'linux/arm64'
docker compose -p portal-arm-validation --env-file infra/production.env.example -f infra/compose.production.yaml config --quiet
docker compose -p portal-arm-validation --env-file infra/production.env.example -f infra/compose.production.yaml build
```

O Compose passou na validação de configuração. Os seis digests fixados de Node, Go, Alpine, PostgreSQL, Redis e Nginx oferecem `linux/arm64`. O Node executado em ARM64 no Docker Desktop retornou `arm64`. A execução em VM nativa e o ensaio HTTPS são verificações distintas.

Na VM de homologação, iniciar o build com `docker compose --parallel 1` para limitar a concorrência entre serviços. Medir recursos na VM antes de definir limites ou estimar capacidade de atendimento.

1. Confirmar capacidade Always Free, volumes dentro da cota e acesso à conta. Se não houver capacidade, ensaiar com o Compose de produção em uma máquina Linux disponível na empresa.
2. Construir as imagens em `linux/arm64` e testar as bases fixadas, MinIO e dependências nativas. Registrar consumo de memória, disco e CPU durante o build e os testes.
3. Definir dois nomes DNS para portal e arquivos, com HTTPS confiável. Reusar domínio disponível ou validar subdomínios gratuitos. Restringir SSH e manter banco, Redis, API e console MinIO na rede interna do Compose.
4. Configurar segredos fora do Git, subir volumes novos, aplicar migrações e criar o primeiro administrador pelo procedimento de implantação. Cadastrar dados sintéticos de homologação.
5. Validar acesso pelo celular, perfis, inspeção de ponta a ponta, upload/download, agendamento e PDF/Excel. Realizar backup fora da VM e ensaiar restauração antes de liberar dados reais.

O objetivo é homologação sem custo recorrente de infraestrutura dentro das cotas. Capacidade da conta, DNS, build ARM e restauração são condições para liberar o piloto. Consulte [implantação](deployment.md) e [backup e restauração](backup-and-restore.md).
