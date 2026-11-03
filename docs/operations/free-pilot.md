# Plano de deploy gratuito para homologação

Usar uma VM Ubuntu ARM da Oracle Cloud Always Free, se houver capacidade na região da conta. Reservar inicialmente até 2 OCPUs e 12 GB de RAM dentro da franquia. Conferir os limites no console antes de provisionar. A Oracle pode recuperar VMs ociosas. [Regras Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

O Compose de produção já reúne ingresso HTTPS, Next.js, API, worker, PostgreSQL, Redis e MinIO. Uma VM permite validar o conjunto, inclusive agendamentos e geração de PDF/Excel. O Render gratuito tem PostgreSQL com expiração de 30 dias e não oferece worker gratuito. [Limites do Render](https://render.com/docs/free) · [Workers no Render](https://render.com/docs/migrate-from-heroku)

1. Confirmar capacidade Always Free, volumes dentro da cota e acesso à conta. Se não houver capacidade, ensaiar com o Compose de produção em uma máquina Linux disponível na empresa.
2. Construir as imagens em `linux/arm64` e testar as bases fixadas, MinIO e dependências nativas. Registrar consumo de memória, disco e CPU durante o build e os testes.
3. Definir dois nomes DNS para portal e arquivos, com HTTPS confiável. Reusar domínio disponível ou validar subdomínios gratuitos. Restringir SSH e manter banco, Redis, API e console MinIO na rede interna do Compose.
4. Configurar segredos fora do Git, subir volumes novos, aplicar migrações e criar o primeiro administrador pelo procedimento de implantação. Cadastrar dados sintéticos de homologação.
5. Validar acesso pelo celular, perfis, inspeção de ponta a ponta, upload/download, agendamento e PDF/Excel. Realizar backup fora da VM e ensaiar restauração antes de liberar dados reais.

O objetivo é homologação sem custo recorrente de infraestrutura dentro das cotas. Capacidade da conta, DNS, build ARM e restauração são condições para liberar o piloto. Consulte [implantação](deployment.md) e [backup e restauração](backup-and-restore.md).
