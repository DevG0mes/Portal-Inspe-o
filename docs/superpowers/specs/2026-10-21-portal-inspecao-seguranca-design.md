# Especificação do Portal de Inspeção de Segurança

## 1. Objetivo

Construir um portal web responsivo para planejar, executar e acompanhar inspeções de segurança. Colaboradores preencherão formulários versionados, gestores acompanharão indicadores e planos de ação dentro do seu escopo organizacional, e administradores manterão usuários, estrutura organizacional e conteúdo dos formulários.

O primeiro lançamento funcionará somente online, será hospedado em servidor interno e atenderá inicialmente entre 100 e 1.000 usuários.

## 2. Escopo do MVP

O MVP inclui:

- autenticação local por e-mail e senha;
- três perfis fixos: colaborador, gestor e administrador;
- unidades e setores com associação de usuários a múltiplos escopos;
- formulários configuráveis, condicionais e versionados;
- inspeções programadas, recorrentes e avulsas;
- respostas com texto, número, data, seleção, sim, não e não aplicável;
- observações, fotos e outras evidências;
- geração automática de não conformidades;
- planos de ação com atribuição, prazo, prioridade, comentários, evidências e validação;
- notificações dentro do portal;
- painéis operacionais e gerenciais;
- exportação em PDF e Excel;
- auditoria das operações relevantes.

Não fazem parte do MVP: operação offline, envio de notificações por e-mail, autenticação corporativa, aplicativo móvel nativo e arquitetura de microsserviços.

## 3. Arquitetura

O sistema será desenvolvido como monorepo com pnpm workspaces e Turborepo. Ele conterá aplicações independentes para interface web, API e processamento assíncrono, além de pacotes compartilhados.

```text
apps/
  web/          Next.js
  api/          NestJS
  worker/       processamento assíncrono

packages/
  contracts/    tipos, DTOs e contratos compartilhados
  ui/           componentes visuais reutilizáveis
  config/       configurações comuns
  testing/      utilitários de testes
```

O backend NestJS será um monólito modular, dividido pelos domínios de autenticação, usuários, organização, formulários, programações, inspeções, planos de ação, notificações, arquivos, métricas, relatórios e auditoria.

### 3.1 Tecnologias

- TypeScript em todo o projeto;
- Next.js e React no frontend;
- NestJS na API;
- PostgreSQL como banco transacional;
- MikroORM para persistência e migrações;
- Redis para filas, coordenação e cache pontual;
- BullMQ para tarefas assíncronas;
- MinIO para fotos, evidências e relatórios;
- API REST documentada com OpenAPI;
- Docker Compose para implantação inicial;
- proxy reverso com HTTPS na rede corporativa.

O frontend não terá acesso direto ao PostgreSQL nem ao MinIO. Todas as operações serão autorizadas pela API.

## 4. Perfis e autorização

### 4.1 Colaborador

O colaborador poderá:

- acessar unidades e setores aos quais esteja vinculado;
- iniciar inspeções avulsas permitidas;
- executar inspeções atribuídas;
- manter inspeções em rascunho;
- acompanhar planos de ação sob sua responsabilidade;
- consultar suas notificações.

### 4.2 Gestor

O gestor poderá estar vinculado a múltiplas unidades e setores. Dentro desse escopo, poderá:

- programar inspeções únicas ou recorrentes;
- acompanhar inspeções e métricas;
- atribuir e revisar planos de ação;
- consultar relatórios e exportações.

### 4.3 Administrador

O administrador terá acesso global e poderá administrar:

- usuários e seus estados;
- vínculos com unidades e setores;
- formulários, seções, perguntas, opções e regras;
- categorias e configurações globais;
- dados de auditoria autorizados.

As permissões serão verificadas no backend para cada operação. Filtros visuais no frontend não constituem controle de acesso.

## 5. Estrutura organizacional

Uma unidade contém setores. Usuários podem se relacionar com múltiplas unidades e setores. Ao iniciar uma inspeção, o colaborador selecionará uma combinação permitida de unidade e setor.

Os vínculos organizacionais determinarão tanto as ações permitidas quanto os dados exibidos nos painéis, pesquisas, relatórios e exportações. Um setor sempre pertencerá a exatamente uma unidade.

## 6. Formulários e versionamento

Um modelo de formulário terá os estados `rascunho`, `publicado` e `arquivado`. Uma versão publicada será imutável. A edição de um formulário publicado criará um novo rascunho, cuja publicação produzirá uma nova versão.

Cada versão conterá:

- seções ordenadas;
- perguntas ordenadas;
- tipo de resposta;
- obrigatoriedade;
- opções de resposta, quando aplicável;
- regras condicionais de exibição;
- regras de geração de não conformidade;
- categoria e prioridade padrão da não conformidade.

As condições poderão depender somente de perguntas anteriores e não poderão formar ciclos. Antes da publicação, o sistema validará referências, opções, regras e dependências. O administrador terá uma pré-visualização para testar o comportamento do formulário.

Uma inspeção sempre ficará ligada à versão exata utilizada em sua criação. Publicações posteriores não alterarão respostas ou relatórios históricos.

## 7. Programações e inspeções

Uma programação definirá formulário, periodicidade, vigência, unidade, setor, responsáveis e prazo. O worker materializará as ocorrências recorrentes de forma idempotente para impedir duplicação após tentativas ou reinicializações.

Inspeções também poderão ser iniciadas de forma avulsa quando o formulário e o escopo permitirem.

O ciclo de uma inspeção será:

1. seleção de atribuição ou formulário avulso;
2. confirmação de unidade e setor permitidos;
3. criação ligada à versão vigente do formulário;
4. preenchimento e salvamento automático em rascunho;
5. envio de fotos e evidências;
6. validação das respostas pelo backend;
7. cálculo de perguntas visíveis, obrigatoriedade e não conformidades;
8. conclusão e bloqueio contra edição comum.

Uma inspeção concluída será imutável. Uma correção exigirá reabertura explícita por usuário autorizado, justificativa e registro de auditoria.

## 8. Não conformidades e planos de ação

Respostas configuradas como não conformes gerarão ocorrências automaticamente na conclusão da inspeção. Cada ocorrência poderá originar um plano de ação com:

- responsável;
- prioridade;
- prazo;
- descrição da ação;
- comentários;
- evidências de correção;
- histórico de transições.

Os estados operacionais serão `aberto`, `em andamento`, `aguardando validação` e `concluído`. O indicador `vencido` será derivado do prazo e coexistirá com o estado operacional.

O responsável poderá executar, comentar e enviar evidências. Ao solicitar a conclusão, o plano passará para `aguardando validação`. Um gestor autorizado poderá aprovar ou devolver o plano com justificativa. Todas as mudanças serão registradas.

## 9. Notificações

O MVP terá central de notificações no portal, sem envio de e-mails. Serão geradas notificações para:

- nova inspeção atribuída;
- inspeção próxima do prazo ou vencida;
- novo plano de ação atribuído;
- plano de ação próximo do prazo ou vencido;
- solicitação de validação;
- aprovação ou devolução de ação.

Cada notificação terá estado lido ou não lido e apontará para o recurso correspondente, desde que o usuário ainda possua autorização para acessá-lo.

## 10. Painéis e relatórios

O painel do colaborador exibirá inspeções atribuídas, prazos, rascunhos, planos sob sua responsabilidade e notificações.

O painel do gestor exibirá, dentro do seu escopo:

- inspeções realizadas, pendentes e vencidas;
- índice de conformidade;
- não conformidades por unidade, setor, formulário, categoria e prioridade;
- ações por estado e prazo;
- tempo médio de resolução;
- evolução por período;
- itens críticos que exigem atenção.

O administrador terá visão global, indicadores de utilização, situação dos formulários, usuários ativos e cobertura organizacional.

Filtros de período, unidade, setor, formulário, categoria e prioridade serão aplicados conforme a autorização do usuário. As exportações em PDF e Excel utilizarão os mesmos filtros e permissões. Exportações serão geradas de forma assíncrona pelo worker e disponibilizadas na central do usuário.

O relatório PDF de inspeção conterá identificação, versão do formulário, respostas, evidências, não conformidades e histórico dos planos de ação relacionados.

## 11. Arquivos

Fotos, evidências e relatórios serão armazenados no MinIO; seus metadados e vínculos permanecerão no PostgreSQL. Uploads aceitarão apenas tipos e tamanhos configurados. Download e visualização utilizarão autorizações temporárias emitidas após validação de acesso pela API.

Registros usados em inspeções não serão apagados fisicamente. Quando necessário, serão arquivados ou desativados. No MVP, fotos, evidências e relatórios serão retidos por prazo indeterminado. Uma política futura de descarte exigirá regra formal aprovada e não poderá destruir o histórico obrigatório.

## 12. Segurança

- senhas armazenadas com Argon2id;
- cookies de sessão seguros, `HttpOnly` e `SameSite`;
- renovação controlada e encerramento remoto de sessões;
- bloqueio temporário após tentativas repetidas de login;
- redefinição inicial de senha pelo administrador;
- troca obrigatória da senha no próximo acesso após redefinição;
- validação de perfil e escopo em todos os endpoints protegidos;
- registro de logins, falhas e alterações de credenciais;
- proteção contra entradas inválidas e limites de requisição;
- ausência de senhas, tokens e conteúdo sensível nos logs.

## 13. Auditoria

A auditoria registrará ator, data, ação, recurso, identificador, contexto de requisição e alterações relevantes. Serão auditadas, no mínimo:

- autenticação e alterações de credenciais;
- criação, alteração, ativação e desativação de usuários;
- mudanças de perfis e vínculos organizacionais;
- publicação e arquivamento de formulários;
- conclusão e reabertura de inspeções;
- atribuições e transições dos planos de ação;
- geração e acesso a exportações sensíveis.

## 14. Confiabilidade e operação

- salvamento automático de inspeções em rascunho;
- aviso de perda de conexão, sem promessa de operação offline;
- chaves de idempotência em operações críticas;
- tarefas BullMQ com tentativas controladas e registro de falhas;
- logs estruturados com identificador de requisição;
- health checks para API, worker, PostgreSQL, Redis e MinIO;
- backup periódico de PostgreSQL e MinIO;
- teste periódico de restauração;
- migrações do MikroORM executadas de forma controlada na implantação.

## 15. Estratégia de testes

- testes unitários das regras condicionais, versionamento, autorização e máquinas de estado;
- testes de integração com PostgreSQL, Redis e MinIO;
- testes de contrato da API REST;
- testes de componentes e acessibilidade no frontend;
- testes ponta a ponta para login, publicação de formulário, inspeções, não conformidades, planos de ação, escopo organizacional e exportações;
- testes de concorrência e idempotência nas recorrências e conclusões;
- verificação de responsividade nos principais tamanhos de tela.

## 16. Critérios de sucesso

- um administrador publica um formulário versionado sem apoio técnico;
- um colaborador conclui pelo celular uma inspeção com evidências;
- um gestor visualiza somente seu escopo e acompanha ações até a validação;
- regras condicionais e não conformidades são recalculadas e validadas pelo servidor;
- versões futuras de formulários não alteram o histórico;
- relatórios respeitam filtros e permissões;
- o sistema opera de forma estável para 100 a 1.000 usuários no ambiente interno.

## 17. Fases posteriores possíveis

- autenticação Microsoft 365/Entra ID;
- notificações por e-mail ou mensageria corporativa;
- experiência offline com sincronização;
- aplicativo móvel nativo;
- permissões personalizadas além dos três perfis fixos;
- tabelas agregadas ou serviço analítico dedicado;
- extração de módulos para serviços independentes quando métricas reais justificarem.
