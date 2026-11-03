# Importação de fichas e identificação da inspeção

Atualização de 03/11/2026: o formato de upload agora é **Pergunta;Tipo**, uma pergunta por linha. Consulte `import-format.md`; a descrição abaixo dos cabeçalhos horizontais registra o formato anterior e o contrato interno legado.

## Operação administrativa

1. Cadastre as unidades de negócio e seus tipos de inspeção. A unidade chamada **Alojamento** usa endereços para novas inspeções e programações.
2. Em **Clientes**, vincule cada cliente às unidades que atende. Em **Subestações**, cadastre as instalações por cliente. Para **Alojamento**, cadastre cada imóvel em **Endereços** com cidade e endereço completo. O cadastro é compartilhado entre as inspeções da unidade, que identificam o cliente separadamente.
3. Em **Formulários → Importar CSV**, selecione o arquivo, nome, unidades atendidas, tipo, perguntas de texto, categoria e prioridade inicial das ocorrências. A prioridade exige escolha explícita e pode ser revisada por pergunta no editor.
4. Prepare a prévia, confira os campos e confirme a criação do rascunho. Revise e publique pelo construtor existente. A importação nunca publica automaticamente.
5. Em **Inspeções → Nova inspeção avulsa**, escolha unidade, setor, cliente, local, participantes opcionais e tipo/modelo publicado. Uma unidade com setor único é preenchida automaticamente na entrada guiada.

O arquivo EPC fornecido tem 30 perguntas principais e 29 ações, totalizando 59 campos. A pergunta 3 e todas as ações são texto. As demais são Sim/Não/Não Aplicável. Uma resposta Não mostra e exige a ação da mesma referência e gera ocorrência com categoria/prioridade configuradas. Campos de texto não entram no denominador de conformidade. Os quatro tipos especializados ficam indisponíveis até seus modelos serem importados e publicados; nenhum conteúdo técnico foi inventado.

## Privacidade e compatibilidade

O navegador lê apenas o primeiro registro lógico do CSV, limitado a 256 KiB, e envia os nomes das colunas. As 173 linhas históricas do exemplo não são importadas. Metadados Status, Protocolo, Criado e Criado por são descartados. A fixture de teste contém somente os cabeçalhos públicos do modelo e uma linha sintética; nunca respostas ou nomes dos registros anteriores.

Participantes são até 20 nomes distintos, um por linha. Identificá-los não envia convites, cria contas, concede acesso ou permite editar respostas.

Novas inspeções com modelos importados exigem cliente/local. A identificação também passa a ser exigida para qualquer modelo numa unidade que já teve cliente vinculado, mesmo após inativação. Unidades legadas nunca configuradas continuam compatíveis com os fluxos antigos. Atribuições antigas sem identificação permanecem utilizáveis.

Os nomes de cliente/local e participantes ficam congelados no contexto. Programação → atribuição → inspeção preserva esse contexto; as etapas revalidam atividade e vínculos sem substituir os nomes históricos. Renomear/inativar cadastros não reescreve inspeções ou PDFs anteriores. Inativar cliente/local impede novas utilizações e suspende materialização de programações inválidas.

## Código e contratos

- `packages/form-engine/src/import-csv.ts`: leitura do cabeçalho e conversão pura, compartilhada pela prévia e API. Rejeita referências duplicadas, pares ausentes, ações órfãs e cabeçalhos desconhecidos.
- `POST /api/forms/import-csv`: ADMIN, UUID idempotente e hash do conteúdo; repetição igual devolve o mesmo modelo, conteúdo diferente com o mesmo UUID retorna 409. Persistência, vínculos e auditoria em uma transação.
- `GET /api/forms/available-types?unitId=...`: cinco tipos com contagem dos modelos publicados vinculados à unidade autorizada. A API também valida o vínculo ao iniciar inspeção/programação.
- `/api/organization/customers` e `/locations`: listagem paginada e busca por escopo; escrita somente ADMIN, revisão otimista para alterações. Não há exclusão física.
- `context` em criação avulsa/programação: `{ customerId, locationId, participants }`. Nomes são capturados pelo servidor, nunca aceitos do cliente. Consultas/PDF usam o snapshot histórico.
- `features/shared/identification-fields.tsx`, `identification-summary.tsx` e `unit-bindings.tsx`: proprietários da interação, reaproveitando os seletores, campos e avisos existentes.

Migrações `202610300001` a `202610300004` acrescentam metadados dos modelos, clientes/locais, contexto e vínculos de modelos. Triggers impedem alteração do contexto persistido. A reversão do contexto recusa perda de registros identificados; não use rollback para apagar dados operacionais. Backups existentes abrangem as novas tabelas.

## Verificação

Testes do conversor, HTTP de importação/cadastros/escopo/histórico, migrações e navegador desktop/celular. O cenário `apps/web/e2e/import-context.spec.ts` usa os 63 cabeçalhos originais, verifica que a linha sintética não é enviada, publica 59 campos, registra cliente multiunidade/local, exige ação para Não, conclui e solicita PDF pelo worker real. Testes usam bancos e contas temporários, separados do portal local.
