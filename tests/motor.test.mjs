// Testes do motor: node tests/motor.test.mjs
// Cada caso confere uma regra da skill do escritório ou da lei com conta feita à mão.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const M = require("../motor.js");
require("../indices.js");
require("../exemplo.js");
const IDX = globalThis.INDICES_BCB;
const CASO = globalThis.CASO_EXEMPLO;

let ok = 0;
const t = (nome, fn) => { try { fn(); ok++; console.log("ok   " + nome); } catch (e) { console.error("FALHA " + nome + "\n  " + e.message); process.exitCode = 1; } };
const perto = (a, b, tol = 0.005, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} esperado ${b}, veio ${a}`);

t("parseBR", () => {
  assert.equal(M.parseBR("R$ 1.234,56"), 1234.56);
  assert.equal(M.parseBR("1,234.56"), 1234.56);
  assert.equal(M.parseBR("300,00"), 300);
  assert.equal(M.parseBR("1.234"), 1234);
  assert.equal(M.parseBR(""), null);
});

t("extenso", () => {
  assert.equal(M.extenso(21640), "vinte e um mil seiscentos e quarenta reais");
  assert.equal(M.extenso(15000), "quinze mil reais");
  assert.equal(M.extenso(1500.5), "mil e quinhentos reais e cinquenta centavos");
  assert.equal(M.extenso(100), "cem reais");
  assert.equal(M.extenso(1000000), "um milhão de reais");
  assert.equal(M.extenso(1250300), "um milhão, duzentos e cinquenta mil e trezentos reais");
  assert.equal(M.extenso(0.01), "um centavo");
});

const rec = M.reconstruirCadeias(CASO.contratos);
t("cadeia: liga elo 0 → refin 1 → refin 2 no mesmo banco; o 033 fica avulso", () => {
  assert.equal(rec.cadeias.length, 1);
  assert.deepEqual(rec.cadeias[0].map((c) => c.contrato), ["0001234567", "0001234590", "0001234612"]);
  assert.deepEqual(rec.avulsos.map((c) => c.contrato), ["7788990011"]);
  assert.equal(rec.rotulo[rec.cadeias[0][2].id], "A-2");
});

const an = M.analisarCadeia(rec.cadeias[0], rec.rotulo);
t("término original = 02/2019 + 83 meses = 01/2026", () => assert.equal(an.termOrig, "2026-01"));
t("restantes antes do refin 1 = 06/2022…01/2026 = 44; acrescidas = 84 − 44 = 40", () => {
  assert.equal(an.refins[0].restAntes, 44);
  assert.equal(an.refins[0].acrescidas, 40);
  assert.equal(an.refins[0].valorAcrescido, 12000);
});
t("refin 2: restantes 04/2024…01/2026 = 22; acrescidas 62", () => {
  assert.equal(an.refins[1].restAntes, 22);
  assert.equal(an.refins[1].acrescidas, 62);
});
t("diferença sem destinação = emprestado − pago − liberado", () => {
  assert.equal(an.refins[0].semDestino, 4000);
  assert.equal(an.refins[1].semDestino, 4000);
});
t("parcela majorada e numeração sequencial", () => { assert.equal(an.igualOuMaior, "majorada"); assert.ok(an.sequencial); });

// Sem HISCRE (estimado), sem atualização, para conferir o indébito à mão:
// refin 1 (06/2022–02/2024, 21 meses): 300 − 300 (parcela original devida) = 0
// refin 2 (04/2024–01/2026, 22 meses): 320 − 300 = 20 → 440
//         (02/2026–10/2026, 9 meses, após o término original): 320 → 2.880
// indevido = 3.320; em dobro (tudo após 30/03/2021) = 6.640
const base = M.calcular({ contratos: CASO.contratos, cfg: Object.assign({}, CASO.cfg, { regime: "nenhum" }) }, IDX);
t("indébito simples = 3.320,00 e em dobro = 6.640,00", () => {
  assert.equal(base.totais.indevido, 3320);
  assert.equal(base.totais.dobro, 6640);
  assert.equal(base.totais.atualizado, 6640);
  assert.ok(base.totais.estimado);
});
t("valor da causa = dobro + dano moral (padrão do escritório)", () => {
  assert.equal(base.totais.valorCausa, 21640);
  assert.equal(base.tokens.VALOR_CAUSA_EXTENSO, "vinte e um mil seiscentos e quarenta reais");
});
t("tokens: contratos impugnados e ativos", () => {
  assert.equal(base.tokens.CONTRATOS_REFIN, "0001234590 e 0001234612");
  assert.equal(base.tokens.CONTRATOS_ATIVOS, "0001234612");
  assert.equal(base.tokens.N_PARCELAS, "52");
  assert.equal(base.tokens.PERC_BENEFICIO, "22,7"); // 320 / 1412
  assert.equal(base.tokens.REST_ORIG, "44");
});
t("elo 0 não é impugnado no modo padrão; mês da troca (05/2022) fica sem desconto", () => {
  assert.ok(base.memoria.filter((m) => m.contrato === "0001234567").every((m) => !m.impugnado));
  assert.ok(!base.memoria.some((m) => m.comp === "2022-05"));
});
t("modo cadeia inteira: soma tudo (elo 0 + refins)", () => {
  const r = M.calcular({ contratos: CASO.contratos, cfg: Object.assign({}, CASO.cfg, { regime: "nenhum", modo: "cadeia", prescricaoAnos: 10 }) }, IDX);
  // elo0 02/2019–04/2022 = 39×300 = 11.700; refin1 21×300 = 6.300; refin2 31×320 = 9.920 → 27.920
  assert.equal(r.totais.indevido, 27920);
  // elo 0: 02/2019–02/2021 (25 meses) simples pela modulação (pago até 30/03/2021, presumido dia 5 do mês seguinte)
  // 03/2021 é pago em 05/04/2021 → dobro. Simples: 25×300 = 7.500; resto em dobro: (27.920 − 7.500)×2 = 40.840
  assert.equal(r.totais.dobro, 7500 + 40840);
});
t("prescrição quinquenal corta descontos anteriores a 11/2021", () => {
  const r = M.calcular({ contratos: CASO.contratos, cfg: Object.assign({}, CASO.cfg, { regime: "nenhum", modo: "cadeia", prescricaoAnos: 5 }) }, IDX);
  assert.ok(r.memoria.filter((m) => m.comp < "2021-11").every((m) => m.prescrito));
  assert.ok(r.memoria.filter((m) => m.comp >= "2021-11").every((m) => !m.prescrito));
});

t("correção TJAM: INPC até 08/2024, IPCA a partir de 09/2024", () => {
  const cfg = Object.assign({}, M.CFG_PADRAO);
  const f = M.fatorCorrecao("2024-07-05", "2024-10-15", cfg, IDX).fator;
  const S = IDX.series;
  const esperado = (1 + S.INPC["2024-07"] / 100) * (1 + S.INPC["2024-08"] / 100) * (1 + S.IPCA["2024-09"] / 100);
  perto(f, esperado, 1e-12);
});
t("correção TJRJ usa IPCA-E antes do marco", () => {
  const cfg = Object.assign({}, M.CFG_PADRAO, M.PRESETS.TJRJ);
  const f = M.fatorCorrecao("2023-01-10", "2023-03-01", cfg, IDX).fator;
  const S = IDX.series;
  perto(f, (1 + S["IPCA-E"]["2023-01"] / 100) * (1 + S["IPCA-E"]["2023-02"] / 100), 1e-12);
});
t("juros: 1% a.m. pro rata até 08/2024, taxa legal do BCB depois (simples)", () => {
  const cfg = Object.assign({}, M.CFG_PADRAO);
  const j = M.juros("2024-07-05", "2024-10-15", cfg, IDX).taxa;
  const S = IDX.series.TAXA_LEGAL;
  const esperado = 1 * (27 / 31) + 1 + S["2024-09"] + S["2024-10"] * (14 / 31);
  perto(j, esperado, 1e-9);
  assert.equal(S["2024-08"], 0.605306); // confere com o exemplo publicado da Res. CMN 5.171
});
t("cálculo atualizado > nominal e linha a linha bate com o total", () => {
  const r = M.calcular({ contratos: CASO.contratos, cfg: CASO.cfg }, IDX);
  assert.ok(r.totais.atualizado > r.totais.dobro);
  const soma = r.memoria.filter((m) => m.impugnado && !m.prescrito).reduce((s, m) => s + m.atualizado, 0);
  perto(soma, r.totais.atualizado, 0.02);
});

t("HISCRE: atribui rubrica 216 pelo valor da parcela e ignora outros consignados", () => {
  const txt = [
    "Competência: 03/2024   Data do pagamento: 05/04/2024",
    "101 VALOR TOTAL DE MR DO PERIODO   1.412,00",
    "216 CONSIGNACAO EMPRESTIMO BANCARIO   300,00",
    "216 CONSIGNACAO EMPRESTIMO BANCARIO   150,00",
    "Competência: 04/2024   Data do pagamento: 06/05/2024",
    "216 CONSIGNACAO EMPRESTIMO BANCARIO   320,00",
    "216 CONSIGNACAO EMPRESTIMO BANCARIO   150,00",
    "216 CONSIGNACAO EMPRESTIMO BANCARIO   99,99",
  ].join("\n");
  const h = M.lerHiscre(txt);
  assert.equal(h.length, 5);
  assert.deepEqual(h[0], { comp: "2024-03", data: "2024-04-05", valor: 300 });
  const elos = M.reconstruirCadeias(CASO.contratos).cadeias[0];
  const d = M.montarDescontos(elos, h, "2026-11");
  // 03/2024: o refin 1 foi excluído em 12/03/2024 → sua janela vai até 02/2024; 300 em 03/2024 não é dele
  assert.equal(d.linhas.length, 1);
  assert.equal(d.linhas[0].comp, "2024-04");
  assert.equal(d.linhas[0].valor, 320);
});

t("tabela colada (Excel) com cabeçalho", () => {
  const txt = "Contrato\tBanco\tSituação\tOrigem da averbação\tData inclusão\tInício de desconto\tFim de desconto\tQtde parcelas\tParcela\tEmprestado\tLiberado\tValor pago\tExclusão\tOrigem da exclusão\n" +
    "0001234590\t389 - BANCO MERCANTIL\tExcluído\tAverbação por refinanciamento\t10/05/2022\t06/2022\t05/2029\t84\tR$ 300,00\tR$ 13.000,00\tR$ 0,00\tR$ 9.000,00\t12/03/2024\tExclusão por refinanciamento";
  const cs = M.lerTabelaColada(txt);
  assert.equal(cs.length, 1);
  const c = cs[0];
  assert.equal(c.banco, "389"); assert.equal(c.origem, "refin"); assert.equal(c.inicio, "2022-06");
  assert.equal(c.exclusao, "2024-03-12"); assert.equal(c.origemExclusao, "refin"); assert.equal(c.pago, 9000);
});

t("PDF por posição: cabeçalho + célula quebrada em duas linhas", () => {
  const cols = [["Contrato", 10], ["Banco", 90], ["Situação", 170], ["Origem", 230], ["Inclusão", 320], ["Início", 380], ["Fim", 430], ["Qtde", 480], ["Parcela", 520], ["Emprestado", 580], ["Liberado", 650], ["Pago", 710], ["Exclusão", 770]];
  const ws = [];
  cols.forEach(([t, x]) => ws.push({ t, x, y: 100, w: 30, h: 8, p: 1 }));
  const linha = [["0001234590", 10], ["389", 90], ["Excluído", 170], ["Averbação", 230], ["10/05/2022", 320], ["06/2022", 380], ["05/2029", 430], ["84", 485], ["R$300,00", 520], ["R$13.000,00", 580], ["R$0,00", 650], ["R$9.000,00", 710], ["12/03/2024", 770]];
  linha.forEach(([t, x]) => ws.push({ t, x, y: 120, w: 30, h: 8, p: 1 }));
  ws.push({ t: "por", x: 230, y: 129, w: 15, h: 8, p: 1 }, { t: "refinanciamento", x: 248, y: 129, w: 40, h: 8, p: 1 });
  const r = M.lerHisconPalavras(ws);
  assert.equal(r.contratos.length, 1);
  const c = r.contratos[0];
  assert.equal(c.contrato, "0001234590"); assert.equal(c.origem, "refin"); assert.equal(c.qtd, 84);
  assert.equal(c.parcela, 300); assert.equal(c.emprestado, 13000); assert.equal(c.exclusao, "2024-03-12");
});

t("PDF: cabeçalho empilhado em 2 linhas (Data/Inclusão, Origem da/Exclusão)", () => {
  const ws = [];
  const l1 = [["Contrato", 30], ["Banco", 100], ["Situação", 140], ["Origem", 195], ["da", 222], ["Data", 290], ["Início", 350], ["Qtde.", 460], ["Valor", 505], ["Valor", 570], ["Valor", 645], ["Data", 760], ["Origem", 815], ["da", 842]];
  const l2 = [["Averbação", 195], ["Inclusão", 290], ["Desconto", 350], ["Parcelas", 460], ["Parcela", 505], ["Emprestado", 570], ["Liberado", 645], ["Exclusão", 760], ["Exclusão", 815]];
  l1.forEach(([t, x]) => ws.push({ t, x, y: 100, w: 25, h: 7, p: 1 }));
  l2.forEach(([t, x]) => ws.push({ t, x, y: 109, w: 25, h: 7, p: 1 }));
  [["0001234567", 30], ["389", 100], ["Excluído", 140], ["Averbação", 195], ["nova", 232], ["10/01/2019", 290], ["02/2019", 350], ["84", 465], ["R$", 500], ["300,00", 515], ["R$", 560], ["12.000,00", 575], ["R$", 635], ["12.000,00", 650], ["10/05/2022", 760], ["Exclusão", 815], ["por", 850]]
    .forEach(([t, x]) => ws.push({ t, x, y: 133, w: 25, h: 7, p: 1 }));
  ws.push({ t: "refinanciamento", x: 815, y: 142, w: 50, h: 7, p: 1 });
  const c = M.lerHisconPalavras(ws).contratos[0];
  assert.equal(c.inclusao, "2019-01-10"); assert.equal(c.exclusao, "2022-05-10"); assert.equal(c.origemExclusao, "refin");
  assert.equal(c.origem, "nova"); assert.equal(c.parcela, 300); assert.equal(c.liberado, 12000);
});

console.log(`\n${ok} testes ok${process.exitCode ? " · HÁ FALHAS" : ""}`);
