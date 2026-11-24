"""Gera HISCON e HISCRE FICTÍCIOS (caso de exemplo.js) para testar a leitura de PDF.

Uso: python tests/gerar_pdfs_ficticios.py  ->  tests/fixtures/hiscon-ficticio.pdf, hiscre-ficticio.pdf
Layout aproximado do Meu INSS: página em paisagem, cabeçalho em duas linhas, "R$" separado do valor.
"""
import os
import pymupdf

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(BASE_DIR, "fixtures")
os.makedirs(SAIDA, exist_ok=True)

CONTRATOS_ATIVOS = [
    ["0001234612", "389", "Ativo", "Averbação por", "12/03/2024", "04/2024", "03/2031", "84", "R$", "320,00", "R$", "15.000,00", "", "", "R$", "11.000,00"],
    ["7788990011", "033", "Ativo", "Averbação nova", "03/02/2023", "03/2023", "02/2030", "84", "R$", "150,00", "R$", "6.000,00", "R$", "6.000,00", "", ""],
]
CONTRATOS_EXCLUIDOS = [
    ["0001234567", "389", "Excluído", "Averbação nova", "10/01/2019", "02/2019", "01/2026", "84", "R$", "300,00", "R$", "12.000,00", "R$", "12.000,00", "", "", "10/05/2022", "Exclusão por"],
    ["0001234590", "389", "Excluído", "Averbação por", "10/05/2022", "06/2022", "05/2029", "84", "R$", "300,00", "R$", "13.000,00", "R$", "0,00", "R$", "9.000,00", "12/03/2024", "Exclusão por"],
]
# x de cada coluna (pontos), cabeçalho em 2 linhas
COLS = [("Contrato", "", 30), ("Banco", "", 100), ("Situação", "", 140), ("Origem da", "Averbação", 195), ("Data", "Inclusão", 290),
        ("Início de", "Desconto", 350), ("Fim de", "Desconto", 405), ("Qtde.", "Parcelas", 460), ("Valor", "Parcela", 505),
        ("Valor", "Emprestado", 570), ("Valor", "Liberado", 645), ("Valor", "Pago", 715), ("Data", "Exclusão", 760), ("Origem da", "Exclusão", 815)]
# posição x de cada token das linhas (R$ e valor em tokens separados)
XS = [30, 100, 140, 195, 290, 350, 405, 465, 500, 515, 560, 575, 635, 650, 705, 720, 760, 815]


def tabela(pg, y, titulo, linhas, excluidos):
    pg.insert_text((30, y), titulo, fontsize=10, fontname="hebo")
    y += 18
    for a, b, x in COLS:
        if excluidos or x < 760:
            pg.insert_text((x, y), a, fontsize=7, fontname="hebo")
            if b:
                pg.insert_text((x, y + 9), b, fontsize=7, fontname="hebo")
    y += 24
    for lin in linhas:
        for txt, x in zip(lin, XS):
            if txt:
                pg.insert_text((x, y), txt, fontsize=7)
        # segunda linha da célula quebrada
        if lin[3].endswith("por"):
            pg.insert_text((195, y + 9), "refinanciamento", fontsize=7)
        if len(lin) > 17 and lin[17].endswith("por"):
            pg.insert_text((815, y + 9), "refinanciamento", fontsize=7)
        y += 24
    return y


doc = pymupdf.open()
p1 = doc.new_page(width=842, height=595)  # A4 paisagem
p1.insert_text((30, 40), "HISTÓRICO DE EMPRÉSTIMO CONSIGNADO", fontsize=13, fontname="hebo")
p1.insert_text((30, 70), "Benefício", fontsize=10, fontname="hebo")
p1.insert_text((30, 88), "Nome: MARIA EXEMPLO DA SILVA", fontsize=9)
p1.insert_text((30, 102), "Nº Benefício: 123.456.789-0", fontsize=9)
p1.insert_text((30, 116), "Espécie: 32 - Aposentadoria por invalidez previdenciária", fontsize=9)
p1.insert_text((30, 140), "Valores do Benefício", fontsize=10, fontname="hebo")
p1.insert_text((30, 156), "BASE DE CÁLCULO R$ 1.412,00", fontsize=9)
p1.insert_text((30, 170), "MÁXIMO DE COMPROMETIMENTO PERMITIDO R$ 494,20", fontsize=9)
p1.insert_text((30, 184), "TOTAL COMPROMETIDO R$ 470,00", fontsize=9)
p1.insert_text((30, 198), "MARGEM EXTRAPOLADA R$ 0,00", fontsize=9)
y = tabela(p1, 240, "Empréstimos Bancários - Contratos ativos e suspensos", CONTRATOS_ATIVOS, False)
p2 = doc.new_page(width=842, height=595)
tabela(p2, 50, "Empréstimos Bancários - Contratos excluídos e encerrados", CONTRATOS_EXCLUIDOS, True)
doc.save(os.path.join(SAIDA, "hiscon-ficticio.pdf"))

# HISCRE: competências com rubrica 216
def comps(a, b):
    ya, ma = map(int, a.split("-")); yb, mb = map(int, b.split("-"))
    i, f = ya * 12 + ma - 1, yb * 12 + mb - 1
    return [f"{k // 12}-{k % 12 + 1:02d}" for k in range(i, f + 1)]

linhas = []
for c in comps("2019-02", "2026-10"):
    y, m = c.split("-")
    nm = int(m) % 12 + 1
    ny = int(y) + (1 if int(m) == 12 else 0)
    descs = []
    if "2019-02" <= c <= "2022-04": descs.append("300,00")
    if "2022-06" <= c <= "2024-02": descs.append("300,00")
    if "2024-04" <= c <= "2026-10": descs.append("320,00")
    if "2023-03" <= c <= "2026-10": descs.append("150,00")
    linhas.append((f"Competência: {m}/{y}   Data do pagamento: 05/{nm:02d}/{ny}", descs))

doc2 = pymupdf.open()
pg, yy = None, 0
for cab, descs in linhas:
    if pg is None or yy > 780:
        pg = doc2.new_page(width=595, height=842); yy = 50
        pg.insert_text((40, 30), "HISTÓRICO DE CRÉDITOS - NB 123.456.789-0", fontsize=11, fontname="hebo")
    pg.insert_text((40, yy), cab, fontsize=8, fontname="hebo"); yy += 11
    pg.insert_text((50, yy), "101 VALOR TOTAL DE MR DO PERIODO", fontsize=8); pg.insert_text((480, yy), "1.412,00", fontsize=8); yy += 11
    for d in descs:
        pg.insert_text((50, yy), "216 CONSIGNACAO EMPRESTIMO BANCARIO", fontsize=8); pg.insert_text((480, yy), d, fontsize=8); yy += 11
    yy += 6
doc2.save(os.path.join(SAIDA, "hiscre-ficticio.pdf"))
print("ok", os.listdir(SAIDA))
