import JSZip from "jszip";

/**
 * Gerador mínimo de .xlsx com formatação (cabeçalho colorido, bordas, quebra de
 * texto, painel congelado). A lib `xlsx` (SheetJS community) não grava estilos,
 * por isso o OOXML é montado aqui direto e empacotado com jszip.
 */

export type XlsxEstilo = "padrao" | "cabecalho" | "corpo" | "titulo" | "negrito" | "nota" | "texto" | "corpoNumero";

export type XlsxLinha = {
  celulas: (string | number | null | undefined)[];
  estilo?: XlsxEstilo;
  /** Mescla a 1ª célula por todas as colunas da aba (texto longo). */
  mesclarTudo?: boolean;
};

export type XlsxAba = {
  nome: string;
  /** Largura de cada coluna (em caracteres). */
  larguras: number[];
  linhas: XlsxLinha[];
  /** Congela as linhas acima desta (1-based: 3 = congela linhas 1 e 2). */
  congelarAntesDaLinha?: number;
};

const ESTILO_IDX: Record<XlsxEstilo, number> = {
  padrao: 0,
  cabecalho: 1,
  corpo: 2,
  titulo: 3,
  negrito: 4,
  nota: 5,
  texto: 6,
  corpoNumero: 7,
};

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><color rgb="FF1F4E79"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="9"/><color rgb="FF595959"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function escXml(v: string): string {
  return v
    // caracteres de controle são inválidos em XML (exceto tab/quebra de linha)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colLetra(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Excel não ajusta sozinho a altura de linha com quebra de texto: estima pelo tamanho do texto. */
function alturaLinha(linha: XlsxLinha, larguras: number[]): number | null {
  const estilo = linha.estilo ?? "padrao";
  const quebra = estilo === "corpo" || estilo === "cabecalho" || estilo === "texto";
  if (estilo === "titulo") return 22;
  if (!quebra) return null;
  let maxLinhas = 1;
  linha.celulas.forEach((v, i) => {
    if (v == null || typeof v === "number") return;
    const largura = linha.mesclarTudo && i === 0 ? larguras.reduce((a, b) => a + b, 0) : larguras[i] ?? 10;
    const porLinha = Math.max(1, Math.floor(largura * 1.1) - 1);
    const n = String(v)
      .split("\n")
      .reduce((acc, p) => acc + Math.max(1, Math.ceil(p.length / porLinha)), 0);
    maxLinhas = Math.max(maxLinhas, n);
  });
  return maxLinhas * 15 + (estilo === "cabecalho" ? 6 : 2);
}

function abaXml(aba: XlsxAba): string {
  const nCols = aba.larguras.length;
  const merges: string[] = [];
  const rows = aba.linhas
    .map((linha, ri) => {
      const r = ri + 1;
      const s = ESTILO_IDX[linha.estilo ?? "padrao"];
      const ht = alturaLinha(linha, aba.larguras);
      const total = linha.mesclarTudo ? nCols : linha.celulas.length;
      if (linha.mesclarTudo && nCols > 1) merges.push(`A${r}:${colLetra(nCols - 1)}${r}`);
      const cells: string[] = [];
      for (let ci = 0; ci < total; ci++) {
        const ref = `${colLetra(ci)}${r}`;
        const v = linha.mesclarTudo && ci > 0 ? null : linha.celulas[ci];
        const st = typeof v === "number" && linha.estilo === "corpo" ? ESTILO_IDX.corpoNumero : s;
        if (v == null || v === "") cells.push(`<c r="${ref}" s="${st}"/>`);
        else if (typeof v === "number") cells.push(`<c r="${ref}" s="${st}"><v>${v}</v></c>`);
        else cells.push(`<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${escXml(v)}</t></is></c>`);
      }
      const htAttr = ht ? ` ht="${ht}" customHeight="1"` : "";
      return `<row r="${r}"${htAttr}>${cells.join("")}</row>`;
    })
    .join("");

  const fr = aba.congelarAntesDaLinha;
  const pane =
    fr && fr > 1
      ? `<pane ySplit="${fr - 1}" topLeftCell="A${fr}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${fr}" sqref="A${fr}"/>`
      : "";
  const cols = aba.larguras
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows}</sheetData>${mergeXml}</worksheet>`;
}

export async function gerarXlsx(abas: XlsxAba[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("")}</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${abas
      .map((a, i) => `<sheet name="${escXml(a.nome.replace(/[\\/?*[\]:]/g, "").slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("")}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file("xl/styles.xml", STYLES_XML);
  abas.forEach((a, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, abaXml(a)));
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function salvarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
