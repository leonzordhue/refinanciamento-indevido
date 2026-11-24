/* =====================================================================
 * LAADV · Refinanciamento Indevido · MOTOR DE CÁLCULO
 * ---------------------------------------------------------------------
 * Puro (sem DOM). Roda no navegador e no Node (tests/motor.test.mjs).
 * Regras: skill do escritório "inicial-refinanciamento-hiscon" (Luís
 * Albert Advocacia), seções 2 e 3, mais a atualização monetária.
 *
 * Fontes normativas (cada função cita a sua):
 *  - CDC, Lei 8.078/1990, art. 42, parágrafo único (repetição em dobro)
 *  - STJ, EAREsp 676.608/RS: dobro independe de má-fé; modulação para
 *    cobranças posteriores a 30/03/2021
 *  - CC, art. 205 (prescrição decenal, posição do escritório); CDC
 *    art. 27 (quinquenal) como alternativa
 *  - CC, arts. 389 e 406, red. Lei 14.905/2024 (IPCA + taxa legal),
 *    efeitos a partir de 30/08/2024; Res. CMN 5.171/2024 (taxa legal,
 *    juros simples, piso zero; BCB SGS 29543)
 *  - CPC, art. 292, VI e VIII (valor da causa)
 *  - Lei 6.899/1981 (correção de débitos judiciais)
 * ===================================================================== */
(function (raiz) {
  "use strict";

  const VERSAO = "1.0.0";

  // ---------------------------------------------------------------- util
  const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

  /** "R$ 1.234,56" | "1234,56" | "1,234.56" | 1234.56 → 1234.56 (null se vazio) */
  function parseBR(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    let s = String(v).replace(/R\$|\s/g, "").replace(/[^\d,.\-]/g, "");
    if (!s || s === "-" ) return null;
    const ultV = s.lastIndexOf(","), ultP = s.lastIndexOf(".");
    if (ultV > ultP) s = s.replace(/\./g, "").replace(",", ".");
    else if (ultP > ultV && ultV >= 0) s = s.replace(/,/g, "");
    else if (ultP >= 0 && ultV < 0) {
      // só pontos: "1.234" (milhar) ou "12.5" (decimal)
      const partes = s.split(".");
      if (partes.length > 2 || (partes[1] && partes[1].length === 3)) s = s.replace(/\./g, "");
    }
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  const brl = (v) => (v === null || v === undefined || !isFinite(v)) ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (v, casas = 2) => (v === null || !isFinite(v)) ? "—"
    : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";

  // ------------------------------------------------------- datas/meses
  // Competência = "AAAA-MM". Índice linear = ano*12 + (mês-1).
  const mIdx = (c) => { const [a, m] = c.split("-").map(Number); return a * 12 + (m - 1); };
  const mStr = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
  const addM = (c, n) => mStr(mIdx(c) + n);
  const mesesEntre = (a, b) => mIdx(b) - mIdx(a); // b − a
  const compBR = (c) => c ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : "—";

  /** "dd/mm/aaaa" | "aaaa-mm-dd" → "aaaa-mm-dd" */
  function dataISO(v) {
    if (!v) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }
  /** "mm/aaaa" | "aaaa-mm" | "dd/mm/aaaa" → "aaaa-mm" */
  function compISO(v) {
    if (!v) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
    m = s.match(/^(\d{4})-(\d{2})$/);
    if (m) return s;
    const d = dataISO(s);
    return d ? d.slice(0, 7) : null;
  }
  const dataBR = (d) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";
  const diasEntre = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
  const diasNoMes = (c) => { const [a, m] = c.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };

  // ------------------------------------------------- normalização
  const SITUACOES = ["Ativo", "Suspenso", "Excluído", "Encerrado"];
  function normSituacao(s) {
    const t = String(s || "").toLowerCase();
    if (t.startsWith("ativ")) return "Ativo";
    if (t.startsWith("susp")) return "Suspenso";
    if (t.startsWith("exclu")) return "Excluído";
    if (t.startsWith("encerr")) return "Encerrado";
    return s ? String(s) : "";
  }
  function normOrigem(s) {
    const t = String(s || "").toLowerCase();
    if (t.includes("refin")) return "refin";
    if (t.includes("porta")) return "port";
    if (t.includes("nova") || t.includes("novo")) return "nova";
    return t ? "outra" : "";
  }
  const ORIGEM_ROTULO = { nova: "Averbação nova", refin: "Averbação por refinanciamento", port: "Averbação por portabilidade", outra: "Outra", "": "—" };

  /** Normaliza um contrato vindo do PDF, CSV ou formulário. */
  function normContrato(c, i = 0) {
    const banco = String(c.banco ?? "").trim();
    const mBanco = banco.match(/^(\d{3})\s*[-–]?\s*(.*)$/);
    return {
      id: c.id || `c${i + 1}`,
      contrato: String(c.contrato ?? "").trim(),
      banco: mBanco ? mBanco[1] : banco,
      bancoNome: (c.bancoNome || (mBanco ? mBanco[2] : "")).trim(),
      situacao: normSituacao(c.situacao),
      origem: ["nova", "refin", "port", "outra", ""].includes(c.origem) ? c.origem : normOrigem(c.origem),
      inclusao: dataISO(c.inclusao),
      inicio: compISO(c.inicio),
      fim: compISO(c.fim),
      qtd: c.qtd === "" || c.qtd === null || c.qtd === undefined ? null : Number(c.qtd),
      parcela: parseBR(c.parcela),
      emprestado: parseBR(c.emprestado),
      liberado: parseBR(c.liberado),
      pago: parseBR(c.pago),
      exclusao: dataISO(c.exclusao),
      origemExclusao: c.origemExclusao ? (["refin", "port", "outra"].includes(c.origemExclusao) ? c.origemExclusao : normOrigem(c.origemExclusao)) : "",
      motivo: c.motivo ? String(c.motivo) : "",
      reconhecido: !!c.reconhecido, // o cliente reconhece este contrato
    };
  }

  // ------------------------------------- 2. reconstrução das cadeias
  /**
   * Liga cada refinanciamento ao contrato que ele quitou (skill, seção 2):
   * mesmo banco; exclusão do anterior até 2 dias da inclusão do novo;
   * origem da exclusão "por refinanciamento". Empate: parcela igual,
   * depois numeração mais próxima.
   */
  function reconstruirCadeias(contratos) {
    const cs = contratos.map(normContrato);
    const porId = Object.fromEntries(cs.map((c) => [c.id, c]));
    const anterior = {}; // id → id do elo anterior
    const usados = new Map(); // id anterior → id sucessor
    const avisos = [];

    const numero = (s) => { const d = String(s).replace(/\D/g, ""); return d ? Number(d.slice(-12)) : NaN; };

    for (const c of cs) {
      if (c.origem !== "refin" && c.origem !== "port") continue;
      if (!c.inclusao) { avisos.push({ nivel: "alerta", texto: `Contrato ${c.contrato}: sem data de inclusão, não dá para achar o elo anterior.` }); continue; }
      const alvoExc = c.origem === "refin" ? "refin" : "port";
      let cands = cs.filter((p) => p.id !== c.id && p.exclusao && Math.abs(diasEntre(p.exclusao, c.inclusao)) <= 2 &&
        (p.origemExclusao === alvoExc || (!p.origemExclusao && alvoExc === "refin")));
      if (c.origem === "refin") cands = cands.filter((p) => p.banco === c.banco);
      if (!cands.length) {
        if (c.origem === "refin") avisos.push({ nivel: "alerta", texto: `Refinanciamento ${c.contrato}: não achei o contrato excluído por refinanciamento em ${dataBR(c.inclusao)} (±2 dias) no banco ${c.banco}. Ele foi tratado como início de cadeia.` });
        continue;
      }
      cands.sort((a, b) => {
        const pa = (a.parcela !== null && c.parcela !== null && Math.abs(a.parcela - c.parcela) < 0.005) ? 0 : 1;
        const pb = (b.parcela !== null && c.parcela !== null && Math.abs(b.parcela - c.parcela) < 0.005) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        const da = Math.abs(diasEntre(a.exclusao, c.inclusao)), db = Math.abs(diasEntre(b.exclusao, c.inclusao));
        if (da !== db) return da - db;
        return Math.abs(numero(a.contrato) - numero(c.contrato)) - Math.abs(numero(b.contrato) - numero(c.contrato));
      });
      const escolhido = cands.find((p) => !usados.has(p.id)) || cands[0];
      if (usados.has(escolhido.id)) avisos.push({ nivel: "alerta", texto: `O contrato ${escolhido.contrato} aparece como quitado por mais de um refinanciamento (${porId[usados.get(escolhido.id)].contrato} e ${c.contrato}). Confira no HISCON.` });
      anterior[c.id] = escolhido.id;
      usados.set(escolhido.id, c.id);
    }

    // monta as cadeias a partir das pontas (quem não é anterior de ninguém)
    const ehAnterior = new Set(Object.values(anterior));
    const cadeias = [];
    const naCadeia = new Set();
    for (const c of cs) {
      if (ehAnterior.has(c.id) || !anterior[c.id]) continue; // só pontas que têm elo anterior
      const elos = [c];
      let cur = c.id;
      const visto = new Set([cur]);
      while (anterior[cur]) {
        cur = anterior[cur];
        if (visto.has(cur)) { avisos.push({ nivel: "erro", texto: "Ciclo na ligação de contratos; confira as datas." }); break; }
        visto.add(cur);
        elos.unshift(porId[cur]);
      }
      elos.forEach((e) => naCadeia.add(e.id));
      cadeias.push(elos);
    }
    // rótulos A, B, C… e A-0, A-1…
    cadeias.sort((a, b) => (a[0].inicio || "").localeCompare(b[0].inicio || ""));
    const rotulo = {};
    cadeias.forEach((cad, i) => cad.forEach((e, k) => { rotulo[e.id] = `${String.fromCharCode(65 + i)}-${k}`; }));
    const avulsos = cs.filter((c) => !naCadeia.has(c.id));
    return { contratos: cs, cadeias, avulsos, rotulo, avisos };
  }

  // ---------------------------------------------- 3. análise da cadeia
  /**
   * Por cadeia (skill, seção 3):
   *  término original = início do elo 0 + (qtd − 1) meses;
   *  restantes antes  = da competência seguinte à exclusão do elo 0 até o término original;
   *  acrescidas       = qtd do refinanciamento − restantes antes;
   *  diferença sem destinação = emprestado − valor pago − liberado.
   */
  function analisarCadeia(elos, rotulo) {
    const e0 = elos[0];
    const termOrig = (e0.inicio && e0.qtd) ? addM(e0.inicio, e0.qtd - 1) : null;
    const avisos = [];
    if (!termOrig) avisos.push({ nivel: "erro", texto: `Elo 0 (${e0.contrato}) sem início de desconto ou quantidade de parcelas: não dá para calcular o término original.` });
    const refins = elos.slice(1).map((r, k) => {
      const prev = elos[k];
      const compExcPrev = prev.exclusao ? prev.exclusao.slice(0, 7) : null;
      const restAntes = (termOrig && compExcPrev) ? Math.max(0, mesesEntre(addM(compExcPrev, 1), termOrig) + 1) : null;
      const acrescidas = (restAntes !== null && r.qtd) ? r.qtd - restAntes : null;
      const termNovo = (r.inicio && r.qtd) ? addM(r.inicio, r.qtd - 1) : null;
      const semDestino = (r.emprestado !== null) ? r2(r.emprestado - (r.pago || 0) - (r.liberado || 0)) : null;
      const semLiberacao = !r.liberado || r.liberado <= 0;
      if (!semLiberacao) avisos.push({ nivel: "alerta", texto: `${rotulo[r.id]} (${r.contrato}): o HISCON registra ${brl(r.liberado)} liberados. Ele NÃO foi tratado como refinanciamento sem liberação; confirme com o cliente se houve crédito na conta.` });
      if (r.pago === null && r.emprestado !== null) avisos.push({ nivel: "info", texto: `${rotulo[r.id]} (${r.contrato}): sem "valor pago" no HISCON; a diferença sem destinação foi calculada com valor pago = 0.` });
      return {
        id: r.id, contrato: r.contrato, rotulo: rotulo[r.id], restAntes, acrescidas,
        valorAcrescido: (acrescidas !== null && r.parcela !== null) ? r2(acrescidas * r.parcela) : null,
        termNovo, semDestino, semLiberacao,
        parcelaMudou: (r.parcela !== null && e0.parcela !== null) ? Math.abs(r.parcela - e0.parcela) >= 0.005 : null,
      };
    });
    const ponta = elos[elos.length - 1];
    const numeros = elos.map((e) => Number(String(e.contrato).replace(/\D/g, "").slice(-12))).filter(isFinite);
    const sequencial = numeros.length > 1 && numeros.every((n, i) => i === 0 || Math.abs(n - numeros[i - 1]) <= 50);
    return {
      e0, ponta, termOrig, refins, avisos, sequencial,
      restOrig: refins.length ? refins[0].restAntes : null,
      igualOuMaior: (ponta.parcela !== null && e0.parcela !== null)
        ? (Math.abs(ponta.parcela - e0.parcela) < 0.005 ? "idêntica" : (ponta.parcela > e0.parcela ? "majorada" : "reduzida")) : null,
      empTotal: r2(elos.slice(1).reduce((s, e) => s + (e.emprestado || 0), 0)),
    };
  }

  // -------------------------------------------- descontos (HISCRE)
  /** Janela de desconto de um contrato no HISCON: início → competência anterior à exclusão (ou fim/hoje). */
  function janela(c, compLimite) {
    if (!c.inicio) return null;
    let fim = c.exclusao ? addM(c.exclusao.slice(0, 7), -1) : (c.fim || compLimite);
    if (compLimite && mIdx(fim) > mIdx(compLimite)) fim = compLimite;
    return mIdx(fim) >= mIdx(c.inicio) ? { ini: c.inicio, fim } : null;
  }

  /**
   * Atribui cada desconto da rubrica 216 (que não traz o nº do contrato) pelo
   * VALOR da parcela dentro da janela do contrato no HISCON (skill, seção 3).
   * Sem HISCRE: estima um desconto por mês na janela, marcado como ESTIMADO.
   */
  function montarDescontos(contratos, hiscre, compCalculo) {
    const avisos = [];
    const linhas = [];
    const ultimaComp = addM(compCalculo, -1);
    if (hiscre && hiscre.length) {
      const sobra = [];
      for (const d of hiscre) {
        const comp = compISO(d.comp);
        const valor = parseBR(d.valor);
        if (!comp || valor === null) continue;
        const cands = contratos.filter((c) => {
          const j = janela(c, ultimaComp);
          return j && mIdx(comp) >= mIdx(j.ini) && mIdx(comp) <= mIdx(j.fim) && c.parcela !== null && Math.abs(c.parcela - valor) < 0.015;
        });
        if (!cands.length) { sobra.push({ comp, valor }); continue; }
        // mesma parcela em dois contratos: decide pela data (o que começou por último na janela)
        cands.sort((a, b) => mIdx(b.inicio) - mIdx(a.inicio));
        const ocupado = linhas.find((l) => l.comp === comp && l.contratoId === cands[0].id);
        const alvo = ocupado && cands[1] ? cands[1] : cands[0];
        linhas.push({ comp, data: dataISO(d.data) || null, valor: r2(valor), contratoId: alvo.id, estimado: false });
      }
      if (sobra.length) avisos.push({ nivel: "info", texto: `${sobra.length} desconto(s) da rubrica 216 no HISCRE não batem com parcela de nenhum contrato do HISCON (outros consignados). Ficaram fora do cálculo.` , detalhe: sobra });
      // meses esperados sem desconto
      for (const c of contratos) {
        const j = janela(c, ultimaComp);
        if (!j) continue;
        const faltam = [];
        for (let i = mIdx(j.ini); i <= mIdx(j.fim); i++) {
          if (!linhas.some((l) => l.contratoId === c.id && l.comp === mStr(i))) faltam.push(mStr(i));
        }
        if (faltam.length && faltam.length <= 24) avisos.push({ nivel: "info", texto: `${c.contrato}: sem desconto no HISCRE em ${faltam.map(compBR).join(", ")} (normal no mês da troca de contrato).` });
        else if (faltam.length > 24) avisos.push({ nivel: "alerta", texto: `${c.contrato}: ${faltam.length} meses da janela sem desconto no HISCRE. O HISCRE enviado pode não cobrir todo o período.` });
      }
    } else {
      for (const c of contratos) {
        const j = janela(c, ultimaComp);
        if (!j || c.parcela === null) continue;
        for (let i = mIdx(j.ini); i <= mIdx(j.fim); i++) linhas.push({ comp: mStr(i), data: null, valor: r2(c.parcela), contratoId: c.id, estimado: true });
      }
      avisos.push({ nivel: "alerta", texto: "Sem HISCRE: os descontos foram estimados pelas datas do HISCON (um por mês na janela de cada contrato). Para a inicial, junte o Histórico de Créditos e marque os valores como estimados se seguir assim." });
    }
    linhas.sort((a, b) => a.comp.localeCompare(b.comp));
    return { linhas, avisos };
  }

  // ------------------------------------------------ índices e atualização
  /** Data de pagamento presumida: dia 5 do mês seguinte à competência (benefício do INSS). */
  const dataPresumida = (comp) => addM(comp, 1) + "-05";

  /**
   * Fator de correção de dataPgto até dataCalc. Meses: do mês do pagamento
   * até o mês anterior ao cálculo (tabelas mensais dos tribunais).
   * Até 08/2024: índice anterior (INPC no TJAM, IPCA-E no TJRJ); de 09/2024
   * em diante: IPCA (CC art. 389, parágrafo único, red. Lei 14.905/2024).
   */
  function fatorCorrecao(dataPgto, dataCalc, cfg, idx) {
    const meses = [];
    let fator = 1, faltou = 0;
    const ini = dataPgto.slice(0, 7), fim = addM(dataCalc.slice(0, 7), -1);
    for (let i = mIdx(ini); i <= mIdx(fim); i++) {
      const c = mStr(i);
      const nome = (cfg.regime === "selic") ? null : (mIdx(c) >= mIdx(cfg.marcoLei) ? "IPCA" : cfg.indiceAntes);
      if (!nome) break;
      const v = idx.series[nome] && idx.series[nome][c];
      if (v === undefined) { faltou++; continue; }
      fator *= 1 + v / 100;
      meses.push(c);
    }
    return { fator, faltou };
  }

  /**
   * Juros simples, pro rata die, de dataIni até dataCalc.
   * Até 08/2024: 1% a.m. (CC art. 406 c/c CTN art. 161, § 1º).
   * De 09/2024: taxa legal mensal do BCB (Res. CMN 5.171/2024, juros simples, piso 0).
   * Regime "selic": SELIC mensal simples, que já engloba a correção.
   */
  function juros(dataIni, dataCalc, cfg, idx) {
    if (!dataIni || dataIni >= dataCalc) return { taxa: 0, faltou: 0 };
    let taxa = 0, faltou = 0;
    for (let i = mIdx(dataIni.slice(0, 7)); i <= mIdx(dataCalc.slice(0, 7)); i++) {
      const c = mStr(i), dm = diasNoMes(c);
      const d0 = (c === dataIni.slice(0, 7)) ? Number(dataIni.slice(8, 10)) : 1;
      const d1 = (c === dataCalc.slice(0, 7)) ? Number(dataCalc.slice(8, 10)) : dm + 1;
      const frac = Math.max(0, d1 - d0) / dm;
      if (frac <= 0) continue;
      let t;
      if (cfg.regime === "selic") t = idx.series.SELIC[c];
      else if (mIdx(c) < mIdx(cfg.marcoLei)) t = cfg.jurosAntes;
      else t = idx.series.TAXA_LEGAL[c];
      if (t === undefined) { faltou++; t = 0; }
      taxa += Math.max(0, t) * frac;
    }
    return { taxa, faltou };
  }

  // ------------------------------------------------------ cálculo geral
  const CFG_PADRAO = {
    tribunal: "TJAM",
    bancoReu: "",              // código do banco réu (3 dígitos)
    modo: "excedente",         // "excedente" (elo 0 reconhecido, pedido g.1) | "cadeia" (cadeia inteira impugnada, g.2)
    dobro: "modulacao",        // "modulacao" (STJ, 30/03/2021) | "dobro" (tudo em dobro) | "simples"
    marcoModulacao: "2021-03-30",
    regime: "lei14905",        // "lei14905" | "selic" | "nenhum"
    marcoLei: "2024-09",       // 1ª competência com IPCA + taxa legal (efeitos em 30/08/2024)
    indiceAntes: "INPC",       // TJAM: INPC · TJRJ: IPCA-E
    jurosAntes: 1,             // % a.m. antes da Lei 14.905
    jurosDesde: "evento",      // "evento" (cada desconto, Súmula 54/STJ) | "citacao"
    dataCitacao: "",
    prescricaoAnos: 10,        // CC art. 205 (escritório) | 5 (CDC art. 27)
    dataAjuizamento: "",       // marco da prescrição; vazio = data do cálculo
    danoMoral: 15000,
    baseCalculo: null,
    dataCalculo: "",           // aaaa-mm-dd
  };

  const PRESETS = {
    TJAM: { tribunal: "TJAM", indiceAntes: "INPC", jurosAntes: 1, danoMoral: 15000 },
    TJRJ: { tribunal: "TJRJ", indiceAntes: "IPCA-E", jurosAntes: 1, danoMoral: 15000 },
  };

  /**
   * Calcula tudo. entrada = { contratos, hiscre (opcional), cfg }.
   * Indevido por mês (contrato da cadeia do banco réu):
   *  - modo "excedente": desconto − parcela do elo 0 enquanto o término
   *    original não passou (a parcela original era devida); depois do término
   *    original, a parcela inteira. O elo 0 em si não é impugnado.
   *  - modo "cadeia": todo desconto dos contratos da cadeia (inclusive o elo 0).
   */
  function calcular(entrada, idx) {
    const cfg = Object.assign({}, CFG_PADRAO, entrada.cfg || {});
    if (!cfg.dataCalculo) cfg.dataCalculo = new Date().toISOString().slice(0, 10);
    const avisos = [];
    const rec = reconstruirCadeias(entrada.contratos || []);
    avisos.push(...rec.avisos);

    const bancos = [...new Set(rec.contratos.map((c) => c.banco).filter(Boolean))];
    if (!cfg.bancoReu) {
      const comCadeia = rec.cadeias.map((c) => c[0].banco);
      cfg.bancoReu = comCadeia[0] || bancos[0] || "";
    }
    const cadeiasReu = rec.cadeias.filter((c) => c[c.length - 1].banco === cfg.bancoReu);
    const cadeiasOutros = rec.cadeias.filter((c) => c[c.length - 1].banco !== cfg.bancoReu);
    if (cadeiasOutros.length) avisos.push({ nivel: "info", texto: `Há ${cadeiasOutros.length} cadeia(s) de outro(s) banco(s) (${[...new Set(cadeiasOutros.map((c) => c[0].banco))].join(", ")}): sugestão de ação autônoma. Não entram neste cálculo.` });
    if (!cadeiasReu.length) avisos.push({ nivel: "erro", texto: `Nenhuma cadeia de refinanciamento do banco ${cfg.bancoReu || "(não definido)"}. Confira o banco réu e os contratos.` });

    const analises = cadeiasReu.map((elos) => analisarCadeia(elos, rec.rotulo));
    analises.forEach((a) => avisos.push(...a.avisos));

    // contratos que entram no cálculo: todos os elos das cadeias do réu
    const elosReu = cadeiasReu.flat();
    const compCalc = cfg.dataCalculo.slice(0, 7);
    const desc = montarDescontos(elosReu, entrada.hiscre, compCalc);
    avisos.push(...desc.avisos);

    const analisePorElo = {};
    analises.forEach((a) => [a.e0, ...a.refins.map((r) => rec.contratos.find((c) => c.id === r.id))].forEach((e) => { analisePorElo[e.id] = a; }));

    // prescrição
    const marcoPresc = cfg.dataAjuizamento || cfg.dataCalculo;
    const limitePresc = addM(marcoPresc.slice(0, 7), -12 * cfg.prescricaoAnos);

    const memoria = [];
    let totDesc = 0, totDed = 0, totInd = 0, totDobro = 0, totCorr = 0, totJur = 0, totAtual = 0, nDesc = 0;
    let faltouIdx = 0;
    const porContrato = {};

    for (const l of desc.linhas) {
      const c = rec.contratos.find((x) => x.id === l.contratoId);
      const a = analisePorElo[c.id];
      if (!a) continue;
      const ehElo0 = c.id === a.e0.id;
      const impugnado = cfg.modo === "cadeia" ? !c.reconhecido : (!ehElo0 && !c.reconhecido);
      let deducao = 0, indevido = 0;
      if (impugnado) {
        if (cfg.modo === "excedente" && a.termOrig && mIdx(l.comp) <= mIdx(a.termOrig)) deducao = Math.min(l.valor, a.e0.parcela || 0);
        indevido = r2(l.valor - deducao);
      }
      const prescrito = mIdx(l.comp) < mIdx(limitePresc);
      const data = l.data || dataPresumida(l.comp);
      const fatorDobro = !impugnado || prescrito ? 0
        : cfg.dobro === "simples" ? 1
        : cfg.dobro === "dobro" ? 2
        : (data > cfg.marcoModulacao ? 2 : 1);
      const base = r2(indevido * fatorDobro);
      let fc = 1, jr = 0;
      if (base > 0 && cfg.regime !== "nenhum") {
        if (cfg.regime !== "selic") { const f = fatorCorrecao(data, cfg.dataCalculo, cfg, idx); fc = f.fator; faltouIdx += f.faltou; }
        const ini = cfg.jurosDesde === "citacao" ? (cfg.dataCitacao || null) : data;
        const j = juros(ini && ini > data ? ini : data, cfg.dataCalculo, cfg, idx);
        if (cfg.jurosDesde === "citacao" && !cfg.dataCitacao) jr = 0; else jr = j.taxa;
        faltouIdx += j.faltou;
      }
      const corrigido = r2(base * fc);
      const jurosV = r2(corrigido * jr / 100);
      const atual = r2(corrigido + jurosV);
      if (impugnado && !prescrito) {
        totDesc += l.valor; totDed += deducao; totInd += indevido; totDobro += base; totCorr += corrigido; totJur += jurosV; totAtual += atual; nDesc++;
        const k = porContrato[c.id] || (porContrato[c.id] = { contrato: c.contrato, rotulo: rec.rotulo[c.id], comps: [], n: 0, parcela: c.parcela, total: 0, deducao: 0, indevido: 0, dobro: 0, atualizado: 0 });
        k.comps.push(l.comp); k.n++; k.total += l.valor; k.deducao += deducao; k.indevido += indevido; k.dobro += base; k.atualizado += atual;
      }
      memoria.push({
        comp: l.comp, data, dataPresumida: !l.data, estimado: l.estimado, contrato: c.contrato, rotulo: rec.rotulo[c.id],
        impugnado, prescrito, descontado: l.valor, deducao: r2(deducao), indevido, fatorDobro, base,
        fatorCorrecao: fc, corrigido, jurosPct: jr, juros: jurosV, atualizado: atual,
      });
    }
    if (faltouIdx) avisos.push({ nivel: "alerta", texto: `Faltaram ${faltouIdx} mês(es) de índice (ainda não publicados). Atualize os índices ou ajuste a data do cálculo.` });
    if (memoria.some((m) => m.prescrito)) avisos.push({ nivel: "info", texto: `Descontos anteriores a ${compBR(limitePresc)} foram excluídos pela prescrição de ${cfg.prescricaoAnos} anos.` });
    if (cfg.dobro === "modulacao" && memoria.some((m) => m.impugnado && !m.prescrito && m.fatorDobro === 1)) avisos.push({ nivel: "info", texto: "Descontos até 30/03/2021 entraram de forma simples (modulação do EAREsp 676.608/STJ). Para pedir o dobro também nesse período é preciso demonstrar má-fé; troque a opção \"Restituição\" se for o caso." });

    // projeção das parcelas vincendas indevidas (contratos ativos)
    let vincendas = 0, nVinc = 0;
    for (const a of analises) {
      const p = a.ponta;
      if (p.situacao !== "Ativo" || !p.inicio || !p.qtd || p.parcela === null) continue;
      const termNovo = addM(p.inicio, p.qtd - 1);
      for (let i = mIdx(compCalc); i <= mIdx(termNovo); i++) {
        const ded = (cfg.modo === "excedente" && a.termOrig && i <= mIdx(a.termOrig)) ? (a.e0.parcela || 0) : 0;
        const v = Math.max(0, p.parcela - ded);
        if (v > 0) { vincendas += v; nVinc++; }
      }
    }

    // tokens da inicial (skill, seções 3 e 4)
    const refinsImp = analises.flatMap((a) => a.refins.map((r) => rec.contratos.find((c) => c.id === r.id))).filter((c) => !c.reconhecido);
    const ativosImp = refinsImp.filter((c) => c.situacao === "Ativo");
    const lista = (xs) => xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " e " + xs[xs.length - 1];
    const somaParcAtivas = ativosImp.reduce((s, c) => s + (c.parcela || 0), 0);
    const valorDobro = r2(totDobro);
    const valorCausa = r2(valorDobro + (Number(cfg.danoMoral) || 0));
    const tokens = {
      NB: "", BASE_CALCULO: cfg.baseCalculo ? brl(cfg.baseCalculo) : "",
      CONTRATOS_REFIN: lista(refinsImp.map((c) => c.contrato)),
      CONTRATOS_ATIVOS: lista(ativosImp.map((c) => c.contrato)),
      REST_ORIG: analises[0] && analises[0].restOrig !== null ? String(analises[0].restOrig) : "",
      EMPR_TOTAL: brl(analises.reduce((s, a) => s + a.empTotal, 0)),
      PERC_BENEFICIO: cfg.baseCalculo ? (somaParcAtivas / cfg.baseCalculo * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "",
      N_PARCELAS: String(nDesc),
      TOTAL_DESCONTADO: brl(r2(totInd)),
      VALOR_DOBRO: valorDobro > 0 ? brl(valorDobro) : "a apurar em liquidação",
      DANO_MORAL: brl(Number(cfg.danoMoral) || 0),
      VALOR_CAUSA: brl(valorCausa),
      VALOR_CAUSA_EXTENSO: extenso(valorCausa),
      IGUAL_OU_MAIOR: analises[0] ? (analises[0].igualOuMaior || "") : "",
      SEQUENCIAL: analises[0] && analises[0].sequencial ? "sequencial" : "",
    };

    return {
      versao: VERSAO, cfg, rec, analises, cadeiasOutros, memoria, porContrato: Object.values(porContrato).map((k) => Object.assign(k, {
        total: r2(k.total), deducao: r2(k.deducao), indevido: r2(k.indevido), dobro: r2(k.dobro), atualizado: r2(k.atualizado),
      })),
      totais: {
        descontado: r2(totDesc), deducao: r2(totDed), indevido: r2(totInd), dobro: valorDobro,
        corrigido: r2(totCorr), juros: r2(totJur), atualizado: r2(totAtual), n: nDesc,
        danoMoral: Number(cfg.danoMoral) || 0, valorCausa, vincendas: r2(vincendas), nVincendas: nVinc,
        estimado: desc.linhas.some((l) => l.estimado),
      },
      tokens, avisos,
    };
  }

  // ------------------------------------------------- valor por extenso
  function extenso(v) {
    if (!isFinite(v)) return "";
    const U = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
    const D = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
    const C = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
    const ate999 = (n) => {
      if (n === 100) return "cem";
      const c = Math.floor(n / 100), r = n % 100, p = [];
      if (c) p.push(C[c]);
      if (r) p.push(r < 20 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? " e " + U[r % 10] : ""));
      return p.join(" e ");
    };
    const inteiro = Math.floor(v + 1e-9), cent = Math.round((v - inteiro) * 100);
    const grupos = [];
    let n = inteiro;
    while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }
    const nomes = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"]];
    const partes = [];
    for (let i = grupos.length - 1; i >= 0; i--) {
      const g = grupos[i];
      if (!g) continue;
      let t = (i === 1 && g === 1) ? "mil" : ate999(g) + (i ? " " + nomes[i][g > 1 ? 1 : 0] : "");
      partes.push({ t, g, i });
    }
    let txt = "";
    partes.forEach((p, k) => {
      if (k === 0) { txt = p.t; return; }
      // "mil e quinhentos", "mil seiscentos e quarenta", "um milhão, duzentos mil"
      if (p.i === 0) txt += (p.g < 100 || p.g % 100 === 0) ? " e " + p.t : " " + p.t;
      else txt += ", " + p.t;
    });
    const sufixoReal = inteiro === 0 ? "" : (inteiro === 1 ? " real" : ((inteiro % 1000000 === 0) ? " de reais" : " reais"));
    let out = inteiro ? txt + sufixoReal : "";
    if (cent) out += (out ? " e " : "") + ate999(cent) + (cent === 1 ? " centavo" : " centavos");
    return out || "zero reais";
  }

  // ======================================================= LEITURA DE PDF
  /*
   * As palavras chegam do pdf.js (PDF com texto) ou do Tesseract (escaneado),
   * no formato {t, x, y, w, h, p}. A tabela do HISCON é montada pelas
   * posições: acha o cabeçalho, agrupa linhas por y e põe cada palavra na
   * coluna de x mais próximo. Linhas sem nº de contrato continuam o registro
   * anterior (célula quebrada em duas linhas). O resultado SEMPRE passa pela
   * conferência humana na tela.
   */
  const COLS = [
    ["contrato", /^contrato$/i], ["banco", /^banco$/i], ["situacao", /^situa/i],
    ["origem", /^origem$/i], ["inclusao", /^inclus/i], ["inicio", /^in[ií]cio$/i],
    ["fim", /^fim$/i], ["qtd", /^(qtde|qtd|quantidade)/i], ["parcela", /^parcela$/i],
    ["emprestado", /^emprestado$/i], ["liberado", /^liberado$/i], ["pago", /^pago$/i],
    ["primeiro", /^primeiro$/i], ["exclusao", /^exclus/i], ["origemExclusao", /^origem$/i], ["motivo", /^motivo$/i],
  ];

  function agruparLinhas(palavras, tol) {
    const ord = palavras.slice().sort((a, b) => a.p - b.p || a.y - b.y || a.x - b.x);
    const linhas = [];
    for (const w of ord) {
      const l = linhas.length ? linhas[linhas.length - 1] : null;
      if (l && l.p === w.p && Math.abs(l.y - w.y) <= tol) { l.ws.push(w); l.y = (l.y * (l.ws.length - 1) + w.y) / l.ws.length; }
      else linhas.push({ p: w.p, y: w.y, ws: [w] });
    }
    linhas.forEach((l) => l.ws.sort((a, b) => a.x - b.x));
    return linhas;
  }

  const RE_DATA = /\b\d{2}\/\d{2}\/\d{4}\b/g;
  const RE_COMP = /\b\d{2}\/\d{4}\b/;
  const RE_MOEDA = /R?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2}/g;
  const RE_CONTRATO = /^[A-Z0-9][A-Z0-9.\-\/]{5,}$/i;

  function lerHisconPalavras(palavras) {
    const avisos = [];
    if (!palavras.length) return { contratos: [], avisos: [{ nivel: "erro", texto: "O PDF não tem texto legível." }] };
    const altMed = palavras.reduce((s, w) => s + (w.h || 8), 0) / palavras.length;
    const linhas = agruparLinhas(palavras, altMed * 0.45);
    const out = [];
    let cab = null, atual = null, secao = "", linhasCab = 0;
    const addCols = (ws) => {
      for (const w of ws) {
        const t = w.t.replace(/[.:]$/, "");
        for (const [nome, re] of COLS) {
          if (!re.test(t)) continue;
          let n = nome;
          if (/^origem$/i.test(t)) { n = cab.cols.some((c) => c.nome === "origem") ? "origemExclusao" : "origem"; }
          if (nome === "origemExclusao") continue;
          // "Origem da Exclusão": o "Exclusão" logo abaixo/ao lado de "Origem" não é a coluna da data
          if (n === "exclusao" && cab.cols.some((c) => c.nome === "origemExclusao" && Math.abs(c.x - (w.x + (w.w || 0) / 2)) < 40)) break;
          if (!cab.cols.some((c) => c.nome === n)) cab.cols.push({ nome: n, x: w.x + (w.w || 0) / 2 });
          break;
        }
      }
    };
    for (const l of linhas) {
      const texto = l.ws.map((w) => w.t).join(" ");
      if (/contratos?\s+ativos/i.test(texto)) secao = "Ativo";
      if (/exclu[ií]dos?\s+e\s+encerrados/i.test(texto)) secao = "Excluído";
      // cabeçalho: linha com "Contrato" e pelo menos 3 outros nomes de coluna
      const hits = l.ws.filter((w) => COLS.some(([, re]) => re.test(w.t.replace(/[.:]$/, ""))));
      if (hits.length >= 4 && l.ws.some((w) => /^contrato$/i.test(w.t))) {
        cab = { p: l.p, cols: [] };
        addCols(l.ws);
        atual = null; linhasCab = 2;
        continue;
      }
      // cabeçalho empilhado ("Data" / "Inclusão"): as 2 linhas seguintes completam as colunas
      if (cab && linhasCab > 0 && !/\d{4,}/.test(texto)) { linhasCab--; addCols(l.ws); continue; }
      linhasCab = 0;
      if (!cab) continue;
      const celulas = {};
      for (const w of l.ws) {
        const cx = w.x + (w.w || 0) / 2;
        let melhor = null, dist = Infinity;
        for (const c of cab.cols) { const d = Math.abs(c.x - cx); if (d < dist) { dist = d; melhor = c.nome; } }
        if (melhor) celulas[melhor] = (celulas[melhor] ? celulas[melhor] + " " : "") + w.t;
      }
      const contratoCel = (celulas.contrato || "").split(" ")[0];
      if (contratoCel && RE_CONTRATO.test(contratoCel) && /\d{4,}/.test(contratoCel)) {
        atual = Object.assign({ _secao: secao }, celulas);
        out.push(atual);
      } else if (atual) {
        for (const [k, v] of Object.entries(celulas)) atual[k] = (atual[k] ? atual[k] + " " : "") + v;
      }
    }
    const contratos = out.map((r, i) => {
      const pega = (k, re) => { const m = String(r[k] || "").match(re); return m ? m[0] : ""; };
      const moeda = (k) => { const m = String(r[k] || "").match(RE_MOEDA); return m ? m[0] : ""; };
      return normContrato({
        contrato: String(r.contrato || "").split(" ")[0],
        banco: String(r.banco || "").trim(),
        situacao: r.situacao || r._secao,
        origem: r.origem || "",
        inclusao: pega("inclusao", /\d{2}\/\d{2}\/\d{4}/),
        inicio: pega("inicio", /\d{2}\/\d{4}/),
        fim: pega("fim", /\d{2}\/\d{4}/),
        qtd: (String(r.qtd || "").match(/\d+/) || [""])[0],
        parcela: moeda("parcela"), emprestado: moeda("emprestado"), liberado: moeda("liberado"), pago: moeda("pago"),
        exclusao: pega("exclusao", /\d{2}\/\d{2}\/\d{4}/),
        origemExclusao: r.origemExclusao || "",
        motivo: r.motivo || "",
      }, i);
    });
    if (!contratos.length) avisos.push({ nivel: "alerta", texto: "Não achei a tabela de contratos pelo cabeçalho. Use \"Colar tabela\" ou preencha à mão." });
    return { contratos, avisos };
  }

  /** Dados do benefício (pág. 1–2 do HISCON) a partir do texto corrido. */
  function lerHisconCabecalho(texto) {
    const t = texto.replace(/\s+/g, " ");
    const pega = (re) => { const m = t.match(re); return m ? m[1].trim() : ""; };
    return {
      nb: pega(/N[ºo°]?\s*(?:do\s+)?Benef[ií]cio[:\s]*([\d.\-\/]{8,})/i),
      especie: pega(/Esp[ée]cie[:\s]*([^\n]{3,60}?)(?:\s{2}|Situa|N[ºo°]|$)/i),
      baseCalculo: parseBR(pega(/BASE\s+DE\s+C[ÁA]LCULO[:\s]*(R?\$?\s?[\d.]+,\d{2})/i)),
      maxComprometimento: parseBR(pega(/M[ÁA]XIMO\s+DE\s+COMPROMETIMENTO\s+PERMITIDO[:\s]*(R?\$?\s?[\d.]+,\d{2})/i)),
      totalComprometido: parseBR(pega(/TOTAL\s+COMPROMETIDO[:\s]*(R?\$?\s?[\d.]+,\d{2})/i)),
      margemExtrapolada: parseBR(pega(/MARGEM\s+EXTRAPOLADA[:\s]*(R?\$?\s?[\d.]+,\d{2})/i)),
    };
  }

  /**
   * HISCRE (Histórico de Créditos): por competência, os valores da rubrica
   * 216 (consignação de empréstimo bancário). Texto linha a linha.
   */
  function lerHiscre(texto) {
    const linhas = texto.split(/\r?\n/);
    const out = [];
    let comp = null, data = null;
    for (const lin of linhas) {
      const l = lin.trim();
      if (!l) continue;
      const mc = l.match(/\b(0[1-9]|1[0-2])\/((?:19|20)\d{2})\b(?!\/)/);
      const md = l.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
      if (/compet/i.test(l) || (mc && md && !/\b216\b/.test(l))) {
        if (mc) comp = `${mc[2]}-${mc[1]}`;
        if (md) data = dataISO(md[1]);
      }
      if (/^\s*216\b|\b216\s*[-–]?\s*CONSIG/i.test(l) || (/CONSIG.*EMPR/i.test(l) && /\b216\b/.test(l))) {
        const vals = l.match(RE_MOEDA) || l.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
        if (vals && comp) out.push({ comp, data, valor: parseBR(vals[vals.length - 1]) });
      }
    }
    return out;
  }

  /** Tabela colada (Excel/CSV, separador ; ou TAB) com cabeçalho. */
  function lerTabelaColada(texto) {
    const linhas = texto.trim().split(/\r?\n/).filter((l) => l.trim());
    if (linhas.length < 2) return [];
    const sep = linhas[0].includes("\t") ? "\t" : ";";
    const cab = linhas[0].split(sep).map((h) => h.trim().toLowerCase());
    const mapa = {
      contrato: /contrato/, banco: /^banco/, situacao: /situa/, origem: /origem.*averb|^origem$/, inclusao: /inclus/,
      inicio: /in[ií]cio/, fim: /^fim/, qtd: /qtd|quant/, parcela: /parcela/, emprestado: /emprest/, liberado: /liberad/,
      pago: /pago/, exclusao: /^(data.*)?exclus[aã]o$|^exclus/, origemExclusao: /origem.*exclus/, motivo: /motivo/,
    };
    const idx = {};
    cab.forEach((h, i) => {
      for (const [k, re] of Object.entries(mapa)) {
        if (idx[k] !== undefined) continue;
        if (k === "exclusao" && /origem|motivo/.test(h)) continue;
        if (k === "origem" && /exclus/.test(h)) continue;
        if (re.test(h)) { idx[k] = i; break; }
      }
    });
    return linhas.slice(1).map((l, i) => {
      const v = l.split(sep);
      const o = {};
      for (const [k, j] of Object.entries(idx)) o[k] = (v[j] || "").trim();
      return normContrato(o, i);
    }).filter((c) => c.contrato);
  }

  const API = {
    VERSAO, CFG_PADRAO, PRESETS, SITUACOES, ORIGEM_ROTULO,
    parseBR, brl, pct, r2, dataISO, compISO, dataBR, compBR, addM, mIdx, mStr,
    normContrato, reconstruirCadeias, analisarCadeia, montarDescontos, fatorCorrecao, juros,
    calcular, extenso, lerHisconPalavras, lerHisconCabecalho, lerHiscre, lerTabelaColada,
  };
  raiz.Motor = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
