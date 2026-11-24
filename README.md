# Refinanciamento Indevido · Luís Albert Advocacia

Calculadora para ações de **refinanciamento indevido de consignado do INSS** (cadeia de refinanciamentos sem liberação de valor).

**Acesse:** https://leonzordhue.github.io/refinanciamento-indevido/

## O que faz

1. **Lê os documentos do cliente** no próprio navegador:
   - HISCON (Histórico de Empréstimo Consignado), em PDF com texto ou escaneado (OCR em português);
   - HISCRE (Histórico de Créditos), rubrica 216.

   Também aceita colar a tabela do Excel ou digitar os contratos.
2. **Reconstrói as cadeias.** Cada refinanciamento é ligado ao contrato que ele quitou: mesmo banco, exclusão "por refinanciamento" até 2 dias da inclusão do novo. Cada elo recebe um rótulo A-0, A-1…
3. **Calcula, por refinanciamento:**
   - término original;
   - parcelas que restavam;
   - parcelas acrescidas e o valor acrescido;
   - diferença sem destinação (emprestado − pago − liberado).
4. **Calcula o indébito mês a mês.** Até o término original, a parcela do contrato reconhecido é deduzida; depois dele, a parcela inteira é indevida. A opção "cadeia inteira" impugna também o primeiro contrato.
5. **Calcula a restituição e a atualização:**
   - restituição em dobro com a modulação do STJ (EAREsp 676.608/RS: simples até 30/03/2021, dobro depois);
   - prescrição de 10 anos (CC art. 205) ou de 5 (CDC art. 27).
6. **Atualiza:**
   - **TJAM:** INPC e juros de 1% a.m. até 08/2024; depois, IPCA e taxa legal (Lei 14.905/2024; Res. CMN 5.171/2024, série 29543 do BCB, juros simples).
   - **TJRJ:** igual, com IPCA-E no lugar do INPC (tabela da CGJ-RJ).
   - **SELIC única:** disponível como alternativa.
7. **Entrega:**
   - o valor da causa (dobro + dano moral, CPC art. 292) com o valor por extenso;
   - o quadro dos contratos impugnados e a restituição por contrato;
   - a memória de cálculo competência a competência, que pode ser impressa em PDF ou exportada em CSV;
   - os campos `[TOKEN]` do modelo de inicial do escritório.

Os índices são atualizados ao abrir a página, direto da API do Banco Central. Se a API não responder, vale a cópia em `indices.js`.

## Privacidade

Nenhum documento sai do computador: pdf.js e Tesseract rodam no navegador. O caso fica só no `localStorage` do navegador, até clicar em "Novo caso". Também pode ser salvo em `.json`. O repositório não contém dado de cliente; o exemplo é fictício.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | Interface (single-page, sem build) |
| `motor.js` | Motor de cálculo puro, com a fonte normativa citada em cada regra |
| `indices.js` | Cópia dos índices do BCB (IPCA 433, INPC 188, IPCA-E 10764, SELIC 4390, taxa legal 29543) |
| `exemplo.js` | Caso fictício de demonstração |
| `tests/motor.test.mjs` | 22 testes com conta feita à mão: `node tests/motor.test.mjs` |
| `tests/gerar_pdfs_ficticios.py` | Gera HISCON/HISCRE fictícios em `tests/fixtures/` para testar a leitura de PDF |

## Antes de protocolar

- Confira o HISCON e o HISCRE linha a linha. A leitura automática sempre passa pela conferência na tela.
- Confira o status dos Temas 1.414 e 1.435 do STJ e a portaria de correção do TJAM; antes do protocolo.
- Nunca use negação categórica de contratação na peça (regra do modelo do escritório).
