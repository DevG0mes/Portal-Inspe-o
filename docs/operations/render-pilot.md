# Piloto para aprovação interna

O objetivo é demonstrar o fluxo real de uma inspeção com dados sintéticos. O investimento em uma VPS fica para a decisão após a apresentação.

## Escopo da demonstração

1. O administrador cadastra cliente, subestação ou endereço, unidade, tipo de inspeção, usuário e permissões. Publica um formulário de demonstração.
2. O colaborador entra, escolhe **Celular**, inicia uma inspeção, responde uma não conformidade com a ação realizada e conclui. Depois consulta a inspeção em **Minhas inspeções**.
3. O gestor abre a **Visão geral**, filtra os indicadores e confere a ocorrência. Validar que outro colaborador não consegue abrir a inspeção pelo endereço direto.

O modo `PORTAL_PILOT=true` usa PostgreSQL e a autenticação do portal. Anexos, geração de relatórios, recorrência, notificações e gestão de planos de ação ficam para a etapa com armazenamento e worker. As respostas textuais condicionais e os indicadores continuam disponíveis.

## Hospedagem

| Serviço    | Configuração                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | Projeto separado no Supabase Free com Data API desabilitada antes de aplicar as migrações. Conexão TLS exclusiva da API.                                                                                    |
| API        | Web Service Docker Free no Render, com `infra/Dockerfile.api`. Usar `PORTAL_PILOT=true`, `APP_ORIGIN` com o URL HTTPS do front-end e `DATABASE_URL` do Supabase. Porta `3001`, saúde `/api/health/ready`.   |
| Front-end  | Web Service Docker Free no Render, com `infra/Dockerfile.web`. Usar `PORTAL_PILOT=true`, `APP_ORIGIN` com a própria origem HTTPS e `API_INTERNAL_URL` com o URL HTTPS da API. Porta `3000`, saúde `/login`. |

Criar ambos a partir do repositório GitHub com contexto Docker na raiz. Fixar a branch aprovada. Configurar URLs e segredos no painel antes do primeiro deploy funcional. Com acesso IPv4, usar o pooler em modo sessão na porta 5432. Aplicar migrações e criar o administrador com os comandos do projeto usando a conexão protegida, uma vez e antes de abrir a demonstração. Usar conexão direta para migração quando disponível. [Conexões PostgreSQL no Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres)

Em um terminal separado, configurar `DATABASE_URL` com a conexão do projeto de homologação e `APP_ORIGIN` com a origem HTTPS do front-end. Fornecer `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` por variáveis protegidas para o segundo comando.

```powershell
$env:PORTAL_PILOT = 'true'
pnpm --filter @portal/api db:migrate
pnpm --filter @portal/api admin:create
```

Antes de apresentar, abrir a saúde da API e o portal para aguardar o início a frio. Os serviços Free podem dormir após 15 minutos e compartilham 750 horas mensais por workspace. Validar que a memória de cada serviço é suficiente com os dados de teste. [Limites do Render](https://render.com/docs/free) · [Limites do Supabase](https://supabase.com/pricing)

Após aprovação, dimensionar a VPS com os resultados do piloto. O [Compose de produção](deployment.md) instala o conjunto completo com worker, Redis e armazenamento de arquivos. Ensaiar HTTPS, backup e restauração antes de iniciar a operação com dados reais.
