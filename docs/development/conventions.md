# Convenções de desenvolvimento

## Fronteiras

- Organizar backend por domínio (`auth`, `organization`, `forms`, `inspections` etc.). Cada módulo concentra seus controladores, serviços, entidades e DTOs.
- Controladores tratam HTTP; serviços coordenam casos de uso; regras puras ficam independentes de banco e transporte.
- O frontend não acessa banco ou armazenamento diretamente. A API valida perfil e escopo em cada operação.
- `contracts` não importa aplicações, entidades ORM ou segredos. Configuração de servidor nunca é exportada ao navegador.
- Extrair abstrações quando houver uma responsabilidade compartilhada concreta; evitar arquivos genéricos como `utils.ts` sem propósito delimitado.

## Código e documentação

- TypeScript estrito; evitar `any`, coerções sem validação e erros silenciosos.
- Código e identificadores em inglês; interface e documentação operacional em português.
- Documentar contratos públicos, invariantes, decisões e razões pouco evidentes. Evitar comentários que apenas repetem o código.
- Configurar segredos por ambiente e nunca registrar credenciais, cookies ou respostas sensíveis.
- Persistir instantes em UTC; apresentar datas e números em `pt-BR` com timezone definido pelo domínio.
- Usar importações ESM com extensão `.js` no backend, inclusive no código TypeScript.
- Encerrar conexões em shutdown e limitar tempo de operações externas.
- SQL que precisa participar de uma transação usa `em.execute`. Consultas pela conexão bruta não recebem automaticamente o contexto transacional do EntityManager; não usá-las para adquirir locks de casos de uso.
- Aplicar filtros organizacionais em SQL antes de contar e paginar resultados. Operações de unidade/setor devem reutilizar `AccessPolicy`.

## Validação

- Escrever testes para comportamento observável antes da implementação.
- Testes unitários cobrem regras; testes HTTP cobrem contratos; testes com serviços reais cobrem integrações.
- Não confundir uma integração simulada com uma validação real de banco, fila ou armazenamento.
- Atualizar o registro de progresso com comandos executados, resultados e pendências. Não marcar tarefa completa com verificações pendentes.
