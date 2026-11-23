# ADR 0001 — Crossref como fonte acadêmica do MVP

## Status

Aceito em 2026-11-23.

## Contexto

O [SCRUM-28](https://otaviogonzaga.atlassian.net/browse/SCRUM-28) pede uma consulta real por periódico e recorte, a verificação dos metadados necessários, o registro das limitações e uma decisão sobre a fonte do MVP. A API já consulta a Crossref por ISSN e período, normaliza os resultados e oferece sincronização manual.

Em 2026-11-23, consultamos `journal-article` publicado entre `2025-01-01` e `2025-01-31` nos endpoints `/journals/{ISSN}/works` da Crossref. A tabela conta campos presentes nos **primeiros 100 registros** retornados por periódico, sem `has-abstract`. Trata-se de uma amostra ordenada pela API, não de uma estimativa de cobertura do periódico inteiro.

| Periódico | ISSN        | Registros no recorte | Amostra | DOI | Título | Autores | Data | URL | Abstract |
| --------- | ----------- | -------------------: | ------: | --: | -----: | ------: | ---: | --: | -------: |
| PLOS ONE  | `1932-6203` |                1.854 |     100 | 100 |    100 |     100 |  100 | 100 |       92 |
| Nature    | `0028-0836` |                  396 |     100 | 100 |    100 |      85 |  100 | 100 |       13 |

Como evidência reproduzível, a amostra incluiu os DOIs [`10.1371/journal.pone.0313138`](https://doi.org/10.1371/journal.pone.0313138) e [`10.1038/d41586-025-00271-4`](https://doi.org/10.1038/d41586-025-00271-4). Com `requireAbstract: true`, o adaptador da aplicação retornou 20 trabalhos normalizados de cada periódico; todos os 40 tinham DOI, título, autores, data, URL e abstract, e as duas consultas retornaram cursor de continuação. Este segundo teste verifica o filtro e a normalização, sem afirmar que todo o acervo tenha esses campos.

A [documentação da Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) explica que os metadados são depositados pelos membros. [Autores e abstracts são recomendados para artigos, mas não obrigatórios](https://www.crossref.org/documentation/schema-library/required-recommended-elements/).

## Decisão

Manter a Crossref como fonte acadêmica inicial do MVP. Consultar periódicos por ISSN e recorte de publicação, manter DOI como identificador de deduplicação e aplicar curadoria humana aos trabalhos importados. Para o fluxo de geração assistida que dependa de resumo, consultar ou selecionar somente registros com abstract; a presença de DOI e título, por si só, não qualifica um trabalho para esse fluxo.

A integração permanece atrás da porta acadêmica existente para permitir outra fonte se a cobertura dos periódicos escolhidos for insuficiente.

## Consequências

- A disponibilidade de abstract e autores varia por periódico e registro. A interface de curadoria deve aceitar campos ausentes e não apresentar um abstract inexistente como conteúdo gerado.
- O filtro `journal-article` não garante que o item seja pesquisa original: a amostra da Nature incluiu o briefing ["The infinite optimism of polymath Gottfried Leibniz"](https://doi.org/10.1038/d41586-025-00271-4), registrado pela Crossref como `journal-article`. A seleção editorial deve avaliar o tipo e a pertinência do trabalho.
- A amostra é limitada aos primeiros 100 registros de dois periódicos em um mês. Antes de ampliar o catálogo do MVP, medir os periódicos efetivamente escolhidos para curadoria.
- A [API pública da Crossref tem limites de requisição](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/). O adaptador atual trata respostas HTTP sem sucesso como indisponibilidade, sem política de espera para `429`; sincronizações frequentes ou volumosas exigem acompanhamento operacional e eventual ajuste de ritmo.

## Alternativas consideradas

- **Somente cadastro manual:** evita dependência da Crossref, mas exige transcrição de metadados e não aproveita a importação já implementada.
- **Substituir a fonte antes do MVP:** a POC não avaliou cobertura de outra fonte nos periódicos escolhidos; uma troca agora adicionaria integração sem evidência de benefício. A porta acadêmica permite reavaliar essa opção quando houver necessidade concreta.
