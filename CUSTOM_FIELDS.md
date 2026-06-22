# Checklist — Custom Fields no ClickUp (pré-requisito do sync)

Crie estes campos **na UI do ClickUp** antes de rodar a integração. O conector/API não cria a *definição* de campo — só preenche valores em campos que já existem.

Onde criar: `Settings > Custom Fields > + New Field`. Marque **Workspace-wide** (reuso entre listas e futuro).

> ⚠️ Os **nomes precisam bater exatamente** (sem diferenciar maiúsculas/acentos importam) com as chaves que o sync usa em `src/mapper.ts`. Se renomear, renomeie nos dois lados.

> ⚠️ **Tipo importa.** O sync escreve valores como texto/número cru. Por isso os campos abaixo são **Text** ou **Money**, nunca Dropdown — um dropdown exigiria o UUID da opção (ex.: não aceita "TX5-W", só o id interno). Dá pra evoluir pra dropdown depois, com um ajuste no mapper.

## Campos que o sync preenche

| # | Nome (exato) | Tipo ClickUp | Observação |
|---|---|---|---|
| 1 | `ID GestãoClick` | Text | **Obrigatório.** Chave de deduplicação. Sem ele o sync pula a OS. |
| 2 | `Nº OS` | Text | Recebe o `codigo` do GestãoClick (ex.: 6250) |
| 3 | `Número de Série` | Text | Padrão E21B + 4 dígitos. Validação regex opcional: `^E21B[0-9]{4}$` |
| 4 | `Modelo` | Text | TX5-G / TX5-W / TX5-PL. (Text agora; dropdown só com ajuste no sync) |
| 5 | `Defeitos Relatados pelo Cliente` | Text (long) | |
| 6 | `Solução Aplicada` | Text (long) | |
| 7 | `Laudo Técnico` | Text (long) | |
| 8 | `Serviços Aplicados` | Text | Lista separada por `;` |
| 9 | `Componentes Aplicados` | Text | Lista com quantidade, ex.: "Bateria 4200 mAh (x1)" |
| 10 | `Total Serviços` | Money (R$) | |
| 11 | `Total Produtos` | Money (R$) | |
| 12 | `Valor Total OS` | Money (R$) | Calculado pelo sync se o GestãoClick não enviar |
| 13 | `Observações Internas` | Text (long) | |

## Campos do mapeamento que o sync ainda NÃO escreve

Crie quando precisar — são preenchidos por automação/equipe no ClickUp, não vêm do GestãoClick:

- `Classificação Técnica` (T1–T5) — não existe nativo no GestãoClick. Pode ser dropdown (preenchido pela equipe) ou virar Campo Extra no GC.
- `Localização Física Atual`, `Valor Agregado para Seguro`, `Tamanho da Caixa`, `Código de Rastreio` — logística interna.
- `Garantia Pós-Reparo` — fórmula (Data Saída + 90d se T1–T3).

## Depois de criar os campos

1. Confirme que `ID GestãoClick` aparece nas listas OS – Avulso / CPFL / NEOENERGIA.
2. Decida o destino dos 4 cards-modelo (6242/6243/6248/6249): apagar e deixar o sync recriar com dado real é o mais limpo (evita duplicata, já que eles não têm `ID GestãoClick`).
3. Rode `npm run sync:once` e confira os cards criados.
