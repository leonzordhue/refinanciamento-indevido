// Caso FICTÍCIO para demonstração e testes (nenhum dado real de cliente).
// Cadeia A no banco 389: elo 0 (averbação nova) → 2 refinanciamentos sem liberação.
// Banco 033: um contrato novo isolado (não entra no cálculo).
globalThis.CASO_EXEMPLO = {
  cliente: { nome: "MARIA EXEMPLO DA SILVA", nb: "123.456.789-0", especie: "32 - Aposentadoria por invalidez previdenciária" },
  cfg: { tribunal: "TJAM", bancoReu: "389", baseCalculo: 1412.00, dataCalculo: "2026-11-24", danoMoral: 15000 },
  contratos: [
    { contrato: "0001234567", banco: "389 - BANCO MERCANTIL DO BRASIL", situacao: "Excluído", origem: "Averbação nova", inclusao: "10/01/2019", inicio: "02/2019", fim: "01/2026", qtd: 84, parcela: "300,00", emprestado: "12.000,00", liberado: "12.000,00", pago: "", exclusao: "10/05/2022", origemExclusao: "Exclusão por refinanciamento", motivo: "Refinanciamento" },
    { contrato: "0001234590", banco: "389 - BANCO MERCANTIL DO BRASIL", situacao: "Excluído", origem: "Averbação por refinanciamento", inclusao: "10/05/2022", inicio: "06/2022", fim: "05/2029", qtd: 84, parcela: "300,00", emprestado: "13.000,00", liberado: "0,00", pago: "9.000,00", exclusao: "12/03/2024", origemExclusao: "Exclusão por refinanciamento", motivo: "Refinanciamento" },
    { contrato: "0001234612", banco: "389 - BANCO MERCANTIL DO BRASIL", situacao: "Ativo", origem: "Averbação por refinanciamento", inclusao: "12/03/2024", inicio: "04/2024", fim: "03/2031", qtd: 84, parcela: "320,00", emprestado: "15.000,00", liberado: "", pago: "11.000,00", exclusao: "", origemExclusao: "", motivo: "" },
    { contrato: "7788990011", banco: "033 - BANCO SANTANDER", situacao: "Ativo", origem: "Averbação nova", inclusao: "03/02/2023", inicio: "03/2023", fim: "02/2030", qtd: 84, parcela: "150,00", emprestado: "6.000,00", liberado: "6.000,00", pago: "", exclusao: "", origemExclusao: "", motivo: "" },
  ],
};
