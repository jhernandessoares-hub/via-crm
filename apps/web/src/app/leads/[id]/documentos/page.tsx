"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

// ─── Constantes ────────────────────────────────────────────────────────────────

const TIPOS_PADRAO = [
  { value: "RG_CNH",            label: "RG / CNH" },
  { value: "CPF",               label: "CPF" },
  { value: "COMP_RESIDENCIA",   label: "Comprovante de Residência" },
  { value: "COMP_RENDA",        label: "Comprovante de Renda" },
  { value: "FGTS",              label: "Extrato FGTS" },
  { value: "DECL_IR",           label: "Declaração de IR" },
  { value: "CERT_ESTADO_CIVIL", label: "Certidão (nasc./casamento)" },
  { value: "CONTRATO_TRABALHO", label: "Contrato de Trabalho" },
  { value: "OUTRO",             label: "Outro" },
];

const CLASSIFICACOES = [
  { value: "CONJUGE", label: "Cônjuge" },
  { value: "SOCIO",   label: "Sócio" },
  { value: "FIADOR",  label: "Fiador" },
  { value: "OUTRO",   label: "Outro" },
];

const ESTADOS_CIVIS = [
  { value: "",              label: "Não informado" },
  { value: "SOLTEIRO",     label: "Solteiro(a)" },
  { value: "CASADO",       label: "Casado(a)" },
  { value: "DIVORCIADO",   label: "Divorciado(a)" },
  { value: "VIUVO",        label: "Viúvo(a)" },
  { value: "UNIAO_ESTAVEL",label: "União Estável" },
  { value: "SEPARADO",     label: "Separado(a) judicialmente" },
];

const UFS = ["","AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const CLOUDINARY_FILE_LIMIT_BYTES = 10 * 1024 * 1024;
const CLOUDINARY_COMPRESS_THRESHOLD = 8 * 1024 * 1024; // comprime se > 8 MB

// ─── Compressor de PDF ────────────────────────────────────────────────────────
// Renderiza cada página em canvas (JPEG comprimido) e remonta via pdf-lib.
// Reduz PDFs escaneados de 20-30 MB para 2-5 MB sem perda visual significativa.

async function compressPdf(file: File, onProgress?: (pct: number) => void): Promise<File> {
  const [{ getDocument, GlobalWorkerOptions }, { PDFDocument }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdf-lib"),
  ]);

  // Worker CDN deve corresponder EXATAMENTE à versão instalada (5.6.205)
  GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdfDoc.numPages;

  const outDoc = await PDFDocument.create();

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 }); // 1.5 = boa qualidade, tamanho razoável

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvasContext: ctx as any, viewport, canvas } as any).promise;

    const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.75);
    const base64 = jpegDataUrl.split(",")[1];
    const jpegBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    const jpegImage = await outDoc.embedJpg(jpegBytes);
    const outPage = outDoc.addPage([viewport.width, viewport.height]);
    outPage.drawImage(jpegImage, { x: 0, y: 0, width: viewport.width, height: viewport.height });

    onProgress?.(Math.round((i / totalPages) * 100));
  }

  const compressedBytes = await outDoc.save();
  return new File([compressedBytes.buffer as ArrayBuffer], file.name, { type: "application/pdf" });
}

// ─── Tipos TS ──────────────────────────────────────────────────────────────────

type DocItem = {
  id: string; tipo: string; nome: string;
  participanteNome: string | null; participanteClassificacao: string | null;
  observacao: string | null; naoAplicavel: boolean; status: string;
  url: string | null; filename: string | null; mimeType: string | null;
  tamanho: number | null; classificadoPorIA: boolean; pendingReview: boolean;
  processingStatus?: string | null; processingStep?: string | null;
  aiExtractedName?: string | null; aiDecision?: string | null;
  aiConfidence?: string | null; aiReason?: string | null; aiSummary?: string | null;
  aiExtractedData?: Record<string, any> | null;
};

type Lead = {
  id: string; nome: string; nomeCorreto?: string | null;
  telefone?: string | null; email?: string | null;
  cpf?: string | null; rg?: string | null;
  dataNascimento?: string | null; estadoCivil?: string | null;
  naturalidade?: string | null; profissao?: string | null;
  empresa?: string | null; endereco?: string | null;
  cep?: string | null; cidade?: string | null; uf?: string | null;
  rendaBrutaFamiliar?: number | null; fgts?: number | null; valorEntrada?: number | null;
  cadastroOrigem?: Record<string, string | null> | null;
};

type Participante = {
  id: string; nome: string; classificacao: string | null;
  cpf?: string | null; rg?: string | null;
  dataNascimento?: string | null; estadoCivil?: string | null;
  naturalidade?: string | null; profissao?: string | null;
  empresa?: string | null; renda?: number | null;
  telefone?: string | null; email?: string | null;
  endereco?: string | null; cep?: string | null;
  cidade?: string | null; uf?: string | null;
  cadastroOrigem?: Record<string, string | null> | null;
};

type UploadTarget = {
  participanteNome: string | null; participanteClassificacao: string | null;
  tipo: string; tipoLabel: string; existingDocId: string | null; isOutro: boolean;
};

type UploadErrorItem = {
  fileName: string;
  message: string;
  sizeBytes?: number | null;
};

type CadastroSuggestionMap = Record<string, { value: any; sourceDocName: string }>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function guessMimeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return null;
}
function classLabel(c: string | null) { return CLASSIFICACOES.find(x => x.value === c)?.label ?? c ?? ""; }
function tipoLabel(v: string) { return TIPOS_PADRAO.find(x => x.value === v)?.label ?? v; }
function docForTipo(docs: DocItem[], pNome: string | null, tipo: string): DocItem | null {
  return docs.find(d => d.participanteNome === pNome && d.tipo === tipo && !d.naoAplicavel && !d.pendingReview) ?? null;
}
function isNA(docs: DocItem[], pNome: string | null, tipo: string): boolean {
  return docs.some(d => d.participanteNome === pNome && d.tipo === tipo && d.naoAplicavel);
}
function outroDocs(docs: DocItem[], pNome: string | null): DocItem[] {
  return docs.filter(d => d.participanteNome === pNome && d.tipo === "OUTRO" && !d.naoAplicavel && !d.pendingReview);
}
function pendingDocs(docs: DocItem[]): DocItem[] {
  return docs.filter(d => d.pendingReview);
}
function processingDocs(docs: DocItem[]): DocItem[] {
  return docs
    .filter(d => d.processingStatus === "EM_FILA" || d.processingStatus === "ANALISANDO" || d.processingStatus === "ERRO")
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
function allDocsForTipo(docs: DocItem[], pNome: string | null, tipo: string): DocItem[] {
  return docs.filter(d => d.participanteNome === pNome && d.tipo === tipo && !d.naoAplicavel && !d.pendingReview);
}
function fmtDate(iso: string | null | undefined): string { return iso ? iso.split("T")[0] : ""; }
function fmtNum(v: number | null | undefined): string { return v != null ? String(v) : ""; }
function fmtFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function parseUploadError(raw: string): UploadErrorItem {
  const text = String(raw || "").trim();
  const sizeMatch = text.match(/Got\s+(\d+)/i);
  const sizeBytes = sizeMatch ? Number(sizeMatch[1]) : null;

  const prefixes = [
    "File size too large.",
    "Maximum is",
    "Upgrade your plan",
    "https://www.cloudinary.com/pricing/upgrades/file-limit",
  ];

  const colonIndex = text.indexOf(": ");
  if (colonIndex > 0) {
    const fileName = text.slice(0, colonIndex).trim();
    const rest = text.slice(colonIndex + 2).trim();
    if (fileName && !prefixes.some(prefix => fileName.startsWith(prefix))) {
      return { fileName, message: rest || "Erro no upload", sizeBytes };
    }
  }

  return { fileName: "Arquivo", message: text || "Erro no upload", sizeBytes };
}
function normalizeSuggestionValue(field: string, value: any): any {
  if (value === null || value === undefined || value === "") return null;
  if (["renda", "rendaBrutaFamiliar", "fgts", "valorEntrada"].includes(field)) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return value;
}
function buildCadastroSuggestions(docs: DocItem[], participanteNome: string | null, isLead: boolean): CadastroSuggestionMap {
  const suggestions: CadastroSuggestionMap = {};
  const targetDocs = docs.filter(d =>
    d.participanteNome === participanteNome &&
    !!d.aiExtractedData &&
    d.processingStatus === "CONCLUIDO",
  );

  for (const doc of targetDocs) {
    const extracted = doc.aiExtractedData || {};
    for (const [field, rawValue] of Object.entries(extracted)) {
      const value = normalizeSuggestionValue(field, rawValue);
      if (value === null) continue;
      const targetField = !isLead && field === "rendaBrutaFamiliar" ? "renda" : field;
      if (!suggestions[targetField]) {
        suggestions[targetField] = { value, sourceDocName: doc.nome || doc.filename || "Documento" };
      }
    }
  }

  return suggestions;
}
function processingStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "EM_FILA": return "Na fila";
    case "ANALISANDO": return "Analisando";
    case "CONCLUIDO": return "Concluído";
    case "PENDENTE_REVISAO": return "Pendente revisão";
    case "ERRO": return "Erro";
    case "MANUAL": return "Manual";
    default: return "Sem status";
  }
}
function processingStatusClass(status: string | null | undefined): string {
  switch (status) {
    case "EM_FILA": return "bg-slate-100 text-slate-700";
    case "ANALISANDO": return "bg-blue-100 text-blue-700";
    case "CONCLUIDO": return "bg-green-100 text-green-700";
    case "PENDENTE_REVISAO": return "bg-amber-100 text-amber-700";
    case "ERRO": return "bg-red-100 text-red-700";
    case "MANUAL": return "bg-gray-100 text-gray-600";
    default: return "bg-gray-100 text-gray-500";
  }
}
function decisionLabel(decision: string | null | undefined): string {
  switch (decision) {
    case "LEAD": return "Lead principal";
    case "PARTICIPANTE_EXISTENTE": return "Participante existente";
    case "NOVO_PARTICIPANTE": return "Novo participante";
    case "ALOCACAO_MANUAL": return "Alocação manual";
    default: return decision || "";
  }
}

// ─── Badge IA ──────────────────────────────────────────────────────────────────

function IABadge({ small }: { small?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded px-1 py-0.5 font-semibold text-blue-700 bg-blue-100 ${small ? "text-[9px]" : "text-[10px]"}`}>
      IA
    </span>
  );
}

// ─── Modal: upload único ───────────────────────────────────────────────────────

function FileModal({ title, showNome, nomeDefault = "", onConfirm, onCancel, busy }: {
  title: string; showNome: boolean; nomeDefault?: string;
  onConfirm: (nome: string, file: File, observacao: string) => void;
  onCancel: () => void; busy: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [nome, setNome] = useState(nomeDefault);
  const [obs, setObs] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [compressPct, setCompressPct] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File) {
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    const maxBytes = isPdf ? PDF_MAX_BYTES : CLOUDINARY_FILE_LIMIT_BYTES;
    if (f.size > maxBytes) {
      setFile(null); setPreviewUrl(null);
      setSizeError(`"${f.name}" tem ${fmtFileSize(f.size)} e excede o limite de ${fmtFileSize(maxBytes)}.`);
      return;
    }
    setSizeError(null);
    setFile(f);
    setPreviewUrl(f.type.startsWith("image/") || f.type === "application/pdf" ? URL.createObjectURL(f) : null);
  }
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const isPdfLarge = !!file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) && file.size > CLOUDINARY_COMPRESS_THRESHOLD;
  const canConfirm = !!file && (!showNome || nome.trim().length > 0);

  async function handleConfirm() {
    if (!file) return;
    let finalFile = file;
    if (isPdfLarge) {
      setCompressing(true);
      setCompressPct(0);
      try {
        finalFile = await compressPdf(file, setCompressPct);
      } catch (err: any) {
        alert("Erro ao comprimir PDF: " + (err?.message ?? String(err)));
        setCompressing(false);
        return;
      }
      setCompressing(false);
    }
    onConfirm(showNome ? nome.trim() : nomeDefault, finalFile, obs.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {!file ? (
            <button className="w-full flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-8 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors" onClick={() => inputRef.current?.click()}>
              <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Clique para escolher o arquivo
              <span className="text-xs text-gray-400">PDF, imagem, Word</span>
            </button>
          ) : (
            <div className="rounded-xl border bg-gray-50 overflow-hidden">
              {previewUrl && file.type.startsWith("image/") && <img src={previewUrl} alt="preview" className="w-full max-h-40 object-contain bg-white" />}
              {previewUrl && file.type === "application/pdf" && <iframe src={previewUrl} className="w-full h-32" title="preview" />}
              {!previewUrl && <div className="flex items-center gap-3 px-4 py-3"><svg className="h-7 w-7 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg><span className="text-sm text-gray-700 truncate">{file.name}</span></div>}
              <div className="px-3 py-2 border-t bg-white flex items-center justify-between">
                <span className="text-xs text-gray-500 truncate">{file.name}</span>
                <button className="text-xs text-blue-600 hover:underline" onClick={() => inputRef.current?.click()}>Trocar</button>
              </div>
            </div>
          )}
          <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
            onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ""; }} />
          {sizeError && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
              {sizeError}
            </div>
          )}
          {showNome && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nome do documento</label>
              <input type="text" autoFocus className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Ex: Holerite, Procuração..." value={nome} onChange={e => setNome(e.target.value)} />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Observação <span className="text-gray-400">(opcional)</span></label>
            <input type="text" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Ex: mês 03/2025, data de emissão..." value={obs} onChange={e => setObs(e.target.value)} />
          </div>
          {isPdfLarge && !compressing && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
              PDF grande ({fmtFileSize(file!.size)}) — será comprimido automaticamente antes do envio.
            </div>
          )}
          {compressing && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
              <div className="flex justify-between mb-1"><span>Comprimindo PDF...</span><span>{compressPct}%</span></div>
              <div className="w-full bg-blue-100 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${compressPct}%` }} />
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={onCancel} disabled={busy || compressing}>Cancelar</button>
            <button className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={handleConfirm} disabled={busy || compressing || !canConfirm}>
              {compressing ? "Comprimindo..." : busy ? "Enviando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper: busca arquivo via proxy autenticado e retorna blob URL ────────────

async function fetchDocBlob(leadId: string, docId: string): Promise<{ blobUrl: string; mimeType: string }> {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  const base = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}/leads/${leadId}/documents/${docId}/view`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Arquivo não disponível");
  const mimeType = (res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
  const blob = await res.blob();
  return { blobUrl: URL.createObjectURL(blob), mimeType };
}

// ─── Modal: preview de documento ──────────────────────────────────────────────

function PreviewModal({ leadId, docId, nome, onClose }: {
  leadId: string; docId: string; nome: string; onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    fetchDocBlob(leadId, docId)
      .then(({ blobUrl: u, mimeType: m }) => { objectUrl = u; setBlobUrl(u); setMime(m); })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [leadId, docId]);

  const isImage = !!mime?.startsWith("image/");
  const isPdf = mime === "application/pdf";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.88)" }} onClick={onClose}>
      <div className="relative w-full max-w-4xl mx-4 flex flex-col" style={{ maxHeight: "92vh" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-white rounded-t-xl px-4 py-3 shrink-0">
          <span className="text-sm font-medium text-gray-800 truncate flex-1">{nome}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none ml-4">✕</button>
        </div>
        <div className="flex-1 overflow-hidden bg-gray-900 rounded-b-xl flex items-center justify-center min-h-[300px]">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              <span className="text-sm">Carregando...</span>
            </div>
          )}
          {!loading && fetchError && (
            <div className="text-center text-gray-400 p-8">
              <p className="text-sm mb-2">Não foi possível carregar o arquivo.</p>
            </div>
          )}
          {!loading && blobUrl && isImage && (
            <img src={blobUrl} alt={nome} className="max-w-full max-h-[82vh] object-contain" />
          )}
          {!loading && blobUrl && isPdf && (
            <iframe src={blobUrl} className="w-full" style={{ height: "82vh" }} title={nome} />
          )}
          {!loading && blobUrl && !isImage && !isPdf && (
            <div className="text-white text-center p-10">
              <p className="text-sm mb-4 text-gray-300">Visualização não disponível para este formato.</p>
              <a href={blobUrl} download={nome} className="text-blue-400 hover:underline text-sm">
                Baixar arquivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal: bulk upload + classificação IA ─────────────────────────────────────

const PDF_MAX_BYTES = 100 * 1024 * 1024; // rejeita PDFs > 100 MB (impossível comprimir)

function BulkUploadModal({ leadId, onDone, onCancel }: {
  leadId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "compressing" | "uploading" | "sent">("idle");
  const [compressProgress, setCompressProgress] = useState<{ current: number; total: number; pct: number } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [uploadErrors, setUploadErrors] = useState<UploadErrorItem[]>([]);
  const [localRejected, setLocalRejected] = useState<UploadErrorItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function addFiles(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles);
    const rejected: UploadErrorItem[] = [];

    for (const f of arr) {
      const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      const maxBytes = isPdf ? PDF_MAX_BYTES : CLOUDINARY_FILE_LIMIT_BYTES;
      if (f.size > maxBytes) {
        rejected.push({ fileName: f.name, sizeBytes: f.size, message: `Arquivo muito grande (máx ${fmtFileSize(maxBytes)}).` });
      }
    }

    if (rejected.length) {
      setLocalRejected(prev => {
        const map = new Map(prev.map(item => [item.fileName, item]));
        for (const item of rejected) map.set(item.fileName, item);
        return Array.from(map.values());
      });
    }

    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [
        ...prev,
        ...arr.filter(f => {
          if (names.has(f.name)) return false;
          const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
          return f.size <= (isPdf ? PDF_MAX_BYTES : CLOUDINARY_FILE_LIMIT_BYTES);
        }),
      ];
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }

  async function upload() {
    if (!files.length) return;

    // Fase 1: comprimir PDFs grandes
    const toCompress = files.filter(f => {
      const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      return isPdf && f.size > CLOUDINARY_COMPRESS_THRESHOLD;
    });

    let finalFiles = [...files];

    if (toCompress.length > 0) {
      setStatus("compressing");
      setCompressProgress({ current: 0, total: toCompress.length, pct: 0 });
      try {
        for (let i = 0; i < toCompress.length; i++) {
          const original = toCompress[i];
          setCompressProgress({ current: i + 1, total: toCompress.length, pct: 0 });
          const compressed = await compressPdf(original, pct =>
            setCompressProgress({ current: i + 1, total: toCompress.length, pct }),
          );
          finalFiles = finalFiles.map(f => f.name === original.name ? compressed : f);
        }
      } catch (e: any) {
        alert("Erro ao comprimir PDF: " + (e?.message ?? String(e)));
        setStatus("idle");
        setCompressProgress(null);
        return;
      }
      setCompressProgress(null);
    }

    // Fase 2: upload
    setStatus("uploading");
    try {
      const fd = new FormData();
      finalFiles.forEach(f => fd.append("files", f));
      const res = await apiFetch(`/leads/${leadId}/documents/classify-bulk`, { method: "POST", body: fd });
      setPendingCount(res.pending ?? 0);
      setUploadErrors(Array.isArray(res.uploadErrors) ? res.uploadErrors.map(parseUploadError) : []);
      setStatus("sent");
    } catch (e: any) {
      alert(e?.message ?? "Erro ao enviar documentos");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
          <div className="px-6 py-6 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{pendingCount} documento{pendingCount !== 1 ? "s" : ""} enviado{pendingCount !== 1 ? "s" : ""}!</p>
              <p className="text-xs text-gray-500 mt-1">A IA já começou a processar. O painel de acompanhamento abaixo mostra arquivo por arquivo até concluir.</p>
            </div>
            {(localRejected.length > 0 || uploadErrors.length > 0) && (
              <div className="text-left rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                <p className="text-xs font-semibold text-red-600 mb-1">
                  {localRejected.length + uploadErrors.length} erro{localRejected.length + uploadErrors.length > 1 ? "s" : ""} no upload:
                </p>
                {localRejected.map((e, i) => (
                  <p key={`local-${i}`} className="text-xs text-red-500">
                    {e.fileName} ({fmtFileSize(e.sizeBytes)}): {e.message}
                  </p>
                ))}
                {uploadErrors.map((e, i) => (
                  <p key={`server-${i}`} className="text-xs text-red-500">
                    {e.fileName}{e.sizeBytes ? ` (${fmtFileSize(e.sizeBytes)})` : ""}: {e.message}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="px-5 pb-5">
            <button className="w-full rounded-lg bg-blue-600 py-2 text-sm text-white hover:bg-blue-700" onClick={onDone}>
              OK, acompanhar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Subir vários documentos</h3>
            <p className="text-xs text-gray-400 mt-0.5">A IA classifica e organiza automaticamente</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Drop zone */}
          <div
            ref={dropRef}
            className="rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-400 transition-colors cursor-pointer"
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            {files.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-gray-500">
                <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Arraste os arquivos aqui ou clique para selecionar
                <span className="text-xs text-gray-400">PDF, imagens — até 20 arquivos</span>
              </div>
            ) : (
              <div className="p-4 space-y-1.5 max-h-48 overflow-y-auto">
                {files.map((f, i) => {
                  const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
                  const willCompress = isPdf && f.size > CLOUDINARY_COMPRESS_THRESHOLD;
                  return (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span className="flex-1 text-gray-700 truncate">{f.name}</span>
                    {willCompress && <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 shrink-0">será comprimido</span>}
                    <span className="text-xs text-gray-400 shrink-0">{fmtFileSize(f.size)}</span>
                    <button className="text-gray-300 hover:text-red-400 shrink-0" onClick={ev => { ev.stopPropagation(); setFiles(prev => prev.filter((_, j) => j !== i)); }}>✕</button>
                  </div>
                  );
                })}
                <button className="text-xs text-blue-600 hover:underline mt-1" onClick={ev => { ev.stopPropagation(); inputRef.current?.click(); }}>+ Adicionar mais</button>
              </div>
            )}
          </div>
          {localRejected.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3">
              <p className="text-xs font-semibold text-red-600 mb-1">
                {localRejected.length} arquivo{localRejected.length > 1 ? "s" : ""} não será{localRejected.length > 1 ? "ão" : ""} enviado{localRejected.length > 1 ? "s" : ""}:
              </p>
              {localRejected.map((item, i) => (
                <p key={i} className="text-xs text-red-500">
                  {item.fileName} ({fmtFileSize(item.sizeBytes)}): {item.message}
                </p>
              ))}
            </div>
          )}
          <input ref={inputRef} type="file" multiple className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />

          {compressProgress && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
              <div className="flex justify-between mb-1">
                <span>Comprimindo PDF {compressProgress.current}/{compressProgress.total}...</span>
                <span>{compressProgress.pct}%</span>
              </div>
              <div className="w-full bg-blue-100 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${compressProgress.pct}%` }} />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={onCancel} disabled={status !== "idle"}>Cancelar</button>
            <button
              className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              onClick={upload} disabled={!files.length || status !== "idle"}
            >
              {status === "compressing" ? (
                <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Comprimindo...</>
              ) : status === "uploading" ? (
                <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Enviando...</>
              ) : "Enviar e classificar com IA"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: validação AI cadastro ─────────────────────────────────────────────

function AICadastroModal({ leadId, participanteId, participanteNome, displayName, isLead, onConfirm, onCancel }: {
  leadId: string; participanteId?: string; participanteNome: string | null;
  displayName: string; isLead: boolean;
  onConfirm: (campos: Record<string, any>, origens: Record<string, string | null>) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [campos, setCampos] = useState<Record<string, any>>({});
  const [origens, setOrigens] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/leads/${leadId}/ai-cadastro`, {
      method: "POST",
      body: JSON.stringify({ participanteNome }),
    }).then(res => {
      setCampos(res.campos);
      setOrigens(res.origens);
      setStatus("ready");
    }).catch(e => {
      setError(e?.message ?? "Erro ao processar documentos");
      setStatus("ready");
    });
  }, []);

  function edit(field: string, value: string) {
    setCampos(prev => ({ ...prev, [field]: value }));
    setOrigens(prev => ({ ...prev, [field]: null })); // humano editou → remove badge IA
  }

  async function confirm() {
    setStatus("saving");
    await onConfirm(campos, origens);
  }

  const Field = ({ label, name, type = "text", options }: { label: string; name: string; type?: string; options?: { value: string; label: string }[] }) => (
    <div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <label className="block text-[10px] text-gray-400 uppercase tracking-wide">{label}</label>
        {origens[name] === "IA" && <IABadge small />}
      </div>
      {options ? (
        <select className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={campos[name] ?? ""} onChange={e => edit(name, e.target.value)}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={campos[name] ?? ""} onChange={e => edit(name, e.target.value)} />
      )}
    </div>
  );

  const aiCount = Object.values(origens).filter(v => v === "IA").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Cadastro com IA — {displayName}</h3>
            {status === "ready" && !error && aiCount > 0 && (
              <p className="text-xs text-blue-600 mt-0.5">{aiCount} campo{aiCount > 1 ? "s" : ""} preenchido{aiCount > 1 ? "s" : ""} pela IA — valide antes de confirmar</p>
            )}
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
              <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Lendo documentos com IA...</span>
            </div>
          )}
          {error && <div className="text-sm text-red-500 py-4">{error}</div>}
          {status === "ready" && !error && (
            <div className="space-y-5">
              <div>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Identificação</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="CPF" name="cpf" />
                  <Field label="RG" name="rg" />
                  <Field label="Data de Nascimento" name="dataNascimento" type="date" />
                  <Field label="Naturalidade" name="naturalidade" />
                  <div className="col-span-2">
                    <Field label="Estado Civil" name="estadoCivil" options={ESTADOS_CIVIS} />
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Contato</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Telefone" name="telefone" />
                  <Field label="Email" name="email" type="email" />
                  <div className="col-span-2"><Field label="Endereço" name="endereco" /></div>
                  <Field label="CEP" name="cep" />
                  <Field label="Cidade" name="cidade" />
                  <div className="col-span-2">
                    <Field label="UF" name="uf" options={UFS.map(u => ({ value: u, label: u || "—" }))} />
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Profissional</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Profissão" name="profissao" />
                  <Field label="Empresa" name="empresa" />
                  <Field label={isLead ? "Renda bruta familiar (R$)" : "Renda mensal (R$)"} name={isLead ? "rendaBrutaFamiliar" : "renda"} type="number" />
                  {isLead && <Field label="FGTS disponível (R$)" name="fgts" type="number" />}
                  {isLead && <Field label="Entrada disponível (R$)" name="valorEntrada" type="number" />}
                </div>
              </div>
            </div>
          )}
        </div>

        {status !== "loading" && !error && (
          <div className="px-5 py-4 border-t flex gap-2 shrink-0">
            <button className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={onCancel} disabled={status === "saving"}>Cancelar</button>
            <button className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50" onClick={confirm} disabled={status === "saving"}>
              {status === "saving" ? "Salvando..." : "Confirmar cadastro"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal: adicionar participante ─────────────────────────────────────────────

function AddParticipanteModal({ onConfirm, onCancel }: { onConfirm: (n: string, c: string) => void; onCancel: () => void; }) {
  const [nome, setNome] = useState(""); const [classificacao, setClassificacao] = useState("CONJUGE");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold text-gray-900">Adicionar participante</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div><label className="block text-xs text-gray-500 mb-1">Nome completo</label>
            <input type="text" autoFocus className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Ex: Maria Silva" value={nome} onChange={e => setNome(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && nome.trim()) onConfirm(nome.trim(), classificacao); if (e.key === "Escape") onCancel(); }} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Classificação</label>
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={classificacao} onChange={e => setClassificacao(e.target.value)}>
              {CLASSIFICACOES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select></div>
          <div className="flex gap-2 pt-1">
            <button className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600" onClick={onCancel}>Cancelar</button>
            <button className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white disabled:opacity-50"
              onClick={() => { if (nome.trim()) onConfirm(nome.trim(), classificacao); }} disabled={!nome.trim()}>Adicionar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: identificar documento (preview + form) ────────────────────────────

function IdentifyDocModal({ leadId, doc, participantes, onConfirm, onCancel, busy }: {
  leadId: string; doc: DocItem; participantes: Participante[];
  onConfirm: (docId: string, tipo: string, participanteNome: string | null, nome: string) => void;
  onCancel: () => void; busy: boolean;
}) {
  const [tipo, setTipo] = useState("OUTRO");
  const [participanteNome, setParticipanteNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    fetchDocBlob(leadId, doc.id)
      .then(({ blobUrl: u, mimeType: m }) => { objectUrl = u; setBlobUrl(u); setMime(m); })
      .catch(() => setPreviewError(true))
      .finally(() => setLoadingPreview(false));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [leadId, doc.id]);

  const isImage = !!mime?.startsWith("image/");
  const isPdf = mime === "application/pdf";

  const partOptions = [
    { value: "", label: "Lead principal" },
    ...participantes.map(p => ({ value: p.nome, label: `${p.nome}${p.classificacao ? ` (${classLabel(p.classificacao)})` : ""}` })),
  ];

  const nomeDoc = descricao.trim() || TIPOS_PADRAO.find(t => t.value === tipo)?.label || "Documento";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.88)" }} onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Identificar documento</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[380px]">{doc.filename || doc.nome}</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-4">✕</button>
        </div>

        {/* Body: preview + formulário */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Preview */}
          <div className="flex-1 bg-gray-100 flex items-center justify-center overflow-hidden min-h-[220px]">
            {loadingPreview && (
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <svg className="animate-spin h-7 w-7" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                <span className="text-sm">Carregando...</span>
              </div>
            )}
            {!loadingPreview && previewError && (
              <div className="text-center p-8 text-gray-400">
                <p className="text-sm">Não foi possível carregar a visualização.</p>
              </div>
            )}
            {!loadingPreview && blobUrl && isImage && (
              <img src={blobUrl} alt={doc.nome} className="max-w-full max-h-full object-contain p-3" />
            )}
            {!loadingPreview && blobUrl && isPdf && (
              <iframe src={blobUrl} className="w-full h-full" style={{ minHeight: "340px" }} title={doc.nome} />
            )}
            {!loadingPreview && blobUrl && !isImage && !isPdf && (
              <div className="text-center p-8 text-gray-400">
                <svg className="h-14 w-14 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-gray-500 mb-2">{doc.filename || doc.nome}</p>
                <a href={blobUrl} download={doc.filename || doc.nome} className="text-xs text-blue-600 hover:underline">
                  Baixar arquivo
                </a>
              </div>
            )}
          </div>

          {/* Formulário */}
          <div className="lg:w-72 shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-gray-100">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tipo de documento</label>
                <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={tipo} onChange={e => setTipo(e.target.value)}>
                  {TIPOS_PADRAO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Pertence a</label>
                <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={participanteNome} onChange={e => setParticipanteNome(e.target.value)}>
                  {partOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Descrição <span className="text-gray-400">(opcional)</span></label>
                <input type="text" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Ex: Holerite 03/2025, RG frente e verso..."
                  value={descricao} onChange={e => setDescricao(e.target.value)} />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 shrink-0">
              <button className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={onCancel} disabled={busy}>Cancelar</button>
              <button className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => onConfirm(doc.id, tipo, participanteNome || null, nomeDoc)} disabled={busy}>
                {busy ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: reclassificar documento ──────────────────────────────────────────

function ReclassifyModal({ doc, participantes, onConfirm, onCancel, busy }: {
  doc: DocItem; participantes: Participante[];
  onConfirm: (docId: string, tipo: string, participanteNome: string | null) => void;
  onCancel: () => void; busy: boolean;
}) {
  const [tipo, setTipo] = useState(doc.tipo);
  const [participanteNome, setParticipanteNome] = useState(doc.participanteNome ?? "");
  const partOptions = [
    { value: "", label: "Lead principal" },
    ...participantes.map(p => ({ value: p.nome, label: `${p.nome}${p.classificacao ? ` (${classLabel(p.classificacao)})` : ""}` })),
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Reclassificar documento</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{doc.filename || doc.nome}</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipo de documento</label>
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={tipo} onChange={e => setTipo(e.target.value)}>
              {TIPOS_PADRAO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Pertence a</label>
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={participanteNome} onChange={e => setParticipanteNome(e.target.value)}>
              {partOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={onCancel} disabled={busy}>Cancelar</button>
            <button className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={() => onConfirm(doc.id, tipo, participanteNome || null)} disabled={busy}>
              {busy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Formulário de cadastro (painel direito) ───────────────────────────────────

function CadastroForm({ leadId, isLead, participanteId, initialValues, initialOrigem, aiSuggestions = {}, showFinanceiro }: {
  leadId: string; isLead: boolean; participanteId?: string;
  initialValues: Record<string, any>;
  initialOrigem: Record<string, string | null>;
  aiSuggestions?: CadastroSuggestionMap;
  showFinanceiro: boolean;
}) {
  const [vals, setVals] = useState<Record<string, any>>(initialValues);
  const [origens, setOrigens] = useState<Record<string, string | null>>(initialOrigem);
  const [savedField, setSavedField] = useState<string | null>(null);
  const [errField, setErrField] = useState<string | null>(null);

  // Sync when parent re-renders with new data (after AI confirm)
  useEffect(() => { setVals(initialValues); setOrigens(initialOrigem); }, [JSON.stringify(initialValues), JSON.stringify(initialOrigem)]);

  async function saveField(field: string, value: any, origin: string | null = null) {
    const newOrigens = { ...origens, [field]: origin };
    setOrigens(newOrigens);
    try {
      const body: Record<string, any> = { [field]: value === "" ? null : value, cadastroOrigem: newOrigens };
      if (isLead) {
        await apiFetch(`/leads/${leadId}/qualification`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch(`/leads/${leadId}/participantes/${participanteId}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      setSavedField(field);
      setTimeout(() => setSavedField(s => s === field ? null : s), 2000);
    } catch {
      setErrField(field);
      setTimeout(() => setErrField(e => e === field ? null : e), 3000);
    }
  }

  async function applySuggestion(field: string, value: any) {
    setVals(v => ({ ...v, [field]: value }));
    await saveField(field, value, "IA");
  }

  async function applyAllSuggestions() {
    const entries = Object.entries(aiSuggestions).filter(([field, suggestion]) => {
      const current = vals[field];
      return (current === null || current === undefined || current === "") && suggestion?.value !== null && suggestion?.value !== undefined && suggestion?.value !== "";
    });
    for (const [field, suggestion] of entries) {
      setVals(v => ({ ...v, [field]: suggestion.value }));
      // eslint-disable-next-line no-await-in-loop
      await saveField(field, suggestion.value, "IA");
    }
  }

  const pendingSuggestions = Object.entries(aiSuggestions).filter(([field, suggestion]) => {
    const current = vals[field];
    return (current === null || current === undefined || current === "") && suggestion?.value !== null && suggestion?.value !== undefined && suggestion?.value !== "";
  });

  const Field = ({ label, name, type = "text", options, span2 }: {
    label: string; name: string; type?: string; options?: { value: string; label: string }[]; span2?: boolean;
  }) => {
    const isIA = origens[name] === "IA";
    const suggestion = aiSuggestions[name];
    const showSuggestion = !!suggestion && (vals[name] === null || vals[name] === undefined || vals[name] === "");
    return (
      <div className={span2 ? "col-span-2" : ""}>
        <div className="flex items-center gap-1 mb-0.5">
          <label className="block text-[10px] text-gray-400 uppercase tracking-wide leading-none">{label}</label>
          {isIA && <IABadge small />}
        </div>
        <div className="relative">
          {options ? (
            <select className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white"
              value={vals[name] ?? ""} onChange={e => setVals(v => ({ ...v, [name]: e.target.value }))}
              onBlur={e => saveField(name, e.target.value)}>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input type={type} className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white"
              value={vals[name] ?? ""} onChange={e => setVals(v => ({ ...v, [name]: e.target.value }))}
              onBlur={e => saveField(name, e.target.value)} />
          )}
          {savedField === name && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 text-xs">✓</span>}
          {errField === name && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-red-400 text-xs">!</span>}
        </div>
        {showSuggestion && (
          <div className="mt-1 rounded-md border border-blue-100 bg-blue-50 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-blue-700 truncate">
                  Sugestão da IA: <span className="font-medium">{String(suggestion.value)}</span>
                </div>
                <div className="text-[10px] text-blue-500 truncate">
                  Fonte: {suggestion.sourceDocName}
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded border border-blue-200 bg-white px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-50"
                onClick={() => applySuggestion(name, suggestion.value)}
              >
                Aplicar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 text-xs">
      {pendingSuggestions.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-blue-700">
                {pendingSuggestions.length} sugestão{pendingSuggestions.length > 1 ? "ões" : ""} da IA pronta{pendingSuggestions.length > 1 ? "s" : ""}
              </div>
              <div className="text-[11px] text-blue-600">
                Os campos abaixo podem ser aplicados individualmente ou de uma vez.
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
              onClick={applyAllSuggestions}
            >
              Aplicar campos vazios
            </button>
          </div>
        </div>
      )}
      <div>
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Identificação</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Field label="CPF" name="cpf" />
          <Field label="RG" name="rg" />
          <Field label="Data de Nascimento" name="dataNascimento" type="date" />
          <Field label="Naturalidade" name="naturalidade" />
          <Field label="Estado Civil" name="estadoCivil" options={ESTADOS_CIVIS} span2 />
        </div>
      </div>
      <div>
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Contato</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Field label="Telefone" name="telefone" />
          <Field label="Email" name="email" type="email" />
          <Field label="Endereço" name="endereco" span2 />
          <Field label="CEP" name="cep" />
          <Field label="Cidade" name="cidade" />
          <Field label="UF" name="uf" options={UFS.map(u => ({ value: u, label: u || "—" }))} span2 />
        </div>
      </div>
      <div>
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Profissional</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Field label="Profissão" name="profissao" />
          <Field label="Empresa" name="empresa" />
          <Field label="Renda mensal (R$)" name={isLead ? "rendaBrutaFamiliar" : "renda"} type="number" />
          {showFinanceiro && <Field label="FGTS disponível (R$)" name="fgts" type="number" />}
          {showFinanceiro && <Field label="Entrada disponível (R$)" name="valorEntrada" type="number" />}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function DocumentosPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params?.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
  const [busyUpload, setBusyUpload] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [aiCadastroTarget, setAICadastroTarget] = useState<{
    participanteNome: string | null; participanteId?: string; displayName: string; isLead: boolean;
  } | null>(null);

  // Preview e reclassificação
  const [previewDoc, setPreviewDoc] = useState<{ docId: string; nome: string } | null>(null);
  const [reclassifyDoc, setReclassifyDoc] = useState<DocItem | null>(null);
  const [busyReclassify, setBusyReclassify] = useState(false);

  // Operações
  const [busyNA, setBusyNA] = useState<Set<string>>(new Set());
  const [busyDel, setBusyDel] = useState<Set<string>>(new Set());
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);
  const [busyRemove, setBusyRemove] = useState<Set<string>>(new Set());

  // Identificação de docs pendentes
  const [identifyDoc, setIdentifyDoc] = useState<DocItem | null>(null);
  const [busyIdentify, setBusyIdentify] = useState(false);

  // Accordion cadastro e documentos + ordem unificada de pessoas
  const [openCadastro, setOpenCadastro] = useState<Set<string>>(new Set(["__lead__"]));
  const [openDocs, setOpenDocs] = useState<Set<string>>(new Set(["__lead__"]));
  const [personOrder, setPersonOrder] = useState<string[]>([]);

  // ─── Carga ──────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true); setError(null);
    try {
      const [leadRes, docsRes, partsRes] = await Promise.all([
        apiFetch(`/leads/${leadId}`),
        apiFetch(`/leads/${leadId}/documents`),
        apiFetch(`/leads/${leadId}/participantes`),
      ]);
      setLead(leadRes); setDocs(docsRes); setParticipantes(partsRes);
      // Inicializa ordem unificada de pessoas
      const allIds = ["__lead__", ...partsRes.map((p: any) => p.id)];
      try {
        const stored = localStorage.getItem(`doc_order_${leadId}`);
        if (stored) {
          const parsed: string[] = JSON.parse(stored);
          const valid = new Set(allIds);
          const filtered = parsed.filter(id => valid.has(id));
          const inOrder = new Set(filtered);
          const missing = allIds.filter(id => !inOrder.has(id));
          setPersonOrder([...filtered, ...missing]);
        } else {
          setPersonOrder(allIds);
        }
      } catch {
        setPersonOrder(allIds);
      }
      setOpenDocs(new Set(allIds)); // todas abertas por padrão
    } catch (e: any) { setError(e?.message ?? "Erro ao carregar"); }
    finally { setLoading(false); }
  }

  async function reloadDocs() { const r = await apiFetch(`/leads/${leadId}/documents`); setDocs(r); }
  async function reloadParts() { const r = await apiFetch(`/leads/${leadId}/participantes`); setParticipantes(r); }

  useEffect(() => { if (leadId) loadAll(); }, [leadId]);

  // Polling automático enquanto há documentos sendo classificados em background
  useEffect(() => {
    const classifyingInBackground = docs.some(
      d => d.processingStatus === "EM_FILA" || d.processingStatus === "ANALISANDO",
    );
    if (!classifyingInBackground) return;
    const interval = setInterval(async () => {
      try {
        const [docsRes, partsRes] = await Promise.all([
          apiFetch(`/leads/${leadId}/documents`),
          apiFetch(`/leads/${leadId}/participantes`),
        ]);
        setDocs(docsRes);
        setParticipantes(partsRes);
      } catch { /* silencioso */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [docs, leadId]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  function openUpload(participanteNome: string | null, participanteClassificacao: string | null, tipo: string, tLabel: string) {
    const existing = docForTipo(docs, participanteNome, tipo);
    setUploadTarget({ participanteNome, participanteClassificacao, tipo, tipoLabel: tLabel, existingDocId: existing?.id ?? null, isOutro: tipo === "OUTRO" });
  }

  async function handleUploadConfirm(nome: string, file: File, observacao: string) {
    if (!uploadTarget) return;
    setBusyUpload(true);
    try {
      let docId: string;
      if (uploadTarget.existingDocId) {
        docId = uploadTarget.existingDocId;
      } else {
        const created = await apiFetch(`/leads/${leadId}/documents`, {
          method: "POST",
          body: JSON.stringify({ tipo: uploadTarget.tipo, nome, participanteNome: uploadTarget.participanteNome, participanteClassificacao: uploadTarget.participanteClassificacao, observacao }),
        });
        docId = created.id;
      }
      const fd = new FormData(); fd.append("file", file);
      await apiFetch(`/leads/${leadId}/documents/${docId}/upload`, { method: "POST", body: fd });
      await reloadDocs(); setUploadTarget(null);
    } catch (e: any) { alert(e?.message ?? "Erro ao enviar"); }
    finally { setBusyUpload(false); }
  }

  async function handleToggleNA(participanteNome: string | null, tipo: string, naoAplicavel: boolean) {
    const key = `${participanteNome ?? "__lead__"}|${tipo}`;
    setBusyNA(prev => new Set(prev).add(key));
    try {
      await apiFetch(`/leads/${leadId}/documents/toggle-na`, { method: "POST", body: JSON.stringify({ tipo, naoAplicavel, participanteNome }) });
      await reloadDocs();
    } catch (e: any) { alert(e?.message ?? "Erro"); }
    finally { setBusyNA(prev => { const s = new Set(prev); s.delete(key); return s; }); }
  }

  async function handleDeleteDoc(docId: string) {
    setConfirmDeleteDocId(docId);
  }

  async function confirmDeleteDoc() {
    const docId = confirmDeleteDocId;
    if (!docId) return;
    setConfirmDeleteDocId(null);
    setBusyDel(prev => new Set(prev).add(docId));
    try {
      await apiFetch(`/leads/${leadId}/documents/${docId}`, { method: "DELETE" });
      await reloadDocs();
    } catch (e: any) { alert(e?.message ?? "Erro ao excluir"); }
    finally { setBusyDel(prev => { const s = new Set(prev); s.delete(docId); return s; }); }
  }

  async function handleAddParticipante(nome: string, classificacao: string) {
    const created = await apiFetch(`/leads/${leadId}/participantes`, { method: "POST", body: JSON.stringify({ nome, classificacao }) });
    setParticipantes(prev => [...prev, created]);
    setOpenCadastro(prev => new Set(prev).add(created.id));
    setAddPartOpen(false);
  }

  async function handleRemoveParticipante(partId: string) {
    setBusyRemove(prev => new Set(prev).add(partId));
    try {
      await apiFetch(`/leads/${leadId}/participantes/${partId}`, { method: "DELETE" });
      setParticipantes(prev => prev.filter(p => p.id !== partId));
      await reloadDocs();
    } catch (e: any) { alert(e?.message ?? "Erro"); }
    finally { setBusyRemove(prev => { const s = new Set(prev); s.delete(partId); return s; }); }
  }

  function movePerson(id: string, dir: "up" | "down") {
    setPersonOrder(prev => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      localStorage.setItem(`doc_order_${leadId}`, JSON.stringify(next));
      // Persiste sortOrder de todos os participantes pela nova posição relativa
      const partEntries = next.filter(pid => pid !== "__lead__").map((pid, sortIdx) => ({ pid, sortIdx }));
      Promise.all(
        partEntries.map(({ pid, sortIdx }) =>
          apiFetch(`/leads/${leadId}/participantes/${pid}`, { method: "PATCH", body: JSON.stringify({ sortOrder: sortIdx }) })
        )
      ).catch(() => {});
      return next;
    });
  }

  async function handleIdentifyDoc(docId: string, tipo: string, participanteNome: string | null, nome: string) {
    setBusyIdentify(true);
    try {
      await apiFetch(`/leads/${leadId}/documents/${docId}`, {
        method: "PATCH",
        body: JSON.stringify({ tipo, participanteNome, nome, pendingReview: false }),
      });
      setIdentifyDoc(null);
      await reloadDocs();
    } catch (e: any) { alert(e?.message ?? "Erro ao identificar documento"); }
    finally { setBusyIdentify(false); }
  }

  async function handleReclassify(docId: string, tipo: string, participanteNome: string | null) {
    setBusyReclassify(true);
    try {
      await apiFetch(`/leads/${leadId}/documents/${docId}`, {
        method: "PATCH",
        body: JSON.stringify({ tipo, participanteNome }),
      });
      setReclassifyDoc(null);
      await reloadDocs();
    } catch (e: any) { alert(e?.message ?? "Erro ao reclassificar"); }
    finally { setBusyReclassify(false); }
  }

  async function handleAICadastroConfirm(campos: Record<string, any>, origens: Record<string, string | null>) {
    if (!aiCadastroTarget || !lead) return;
    const { participanteNome, participanteId, isLead } = aiCadastroTarget;
    const body = { ...campos, cadastroOrigem: origens };
    if (isLead) {
      await apiFetch(`/leads/${leadId}/qualification`, { method: "PATCH", body: JSON.stringify(body) });
      // Update local lead state
      setLead(prev => prev ? { ...prev, ...campos, cadastroOrigem: origens } : prev);
    } else if (participanteId) {
      await apiFetch(`/leads/${leadId}/participantes/${participanteId}`, { method: "PATCH", body: JSON.stringify(body) });
      setParticipantes(prev => prev.map(p => p.id === participanteId ? { ...p, ...campos, cadastroOrigem: origens } : p));
    }
    setAICadastroTarget(null);
  }

  // ─── Componentes inline ───────────────────────────────────────────────────────

  function TipoRow({ participanteNome, participanteClassificacao, tipo: tipo_, tipoLabel: tLabel }: {
    participanteNome: string | null; participanteClassificacao: string | null;
    tipo: string; tipoLabel: string;
  }) {
    const typeDocs = allDocsForTipo(docs, participanteNome, tipo_);
    const na = isNA(docs, participanteNome, tipo_);
    const naKey = `${participanteNome ?? "__lead__"}|${tipo_}`;
    const naBusy = busyNA.has(naKey);

    return (
      <div className="border-b border-gray-100 last:border-0">
        {/* Linha do tipo */}
        <div className="flex items-center gap-3 py-2.5">
          <div className="flex-1 min-w-0">
            <span className={`text-sm ${na ? "text-gray-400 line-through" : "text-gray-700"}`}>{tLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {na ? (
              <span className="text-xs text-gray-400 bg-gray-100 rounded px-2 py-0.5">N/A</span>
            ) : typeDocs.length === 0 ? (
              <button className="text-xs text-blue-600 border border-blue-200 rounded-full px-3 py-1 hover:bg-blue-50 transition-colors" onClick={() => openUpload(participanteNome, participanteClassificacao, tipo_, tLabel)}>
                ↑ Fazer upload
              </button>
            ) : (
              <button title="Adicionar outro" className="text-xs text-gray-400 border border-gray-200 rounded-full px-2.5 py-1 hover:bg-gray-50 transition-colors" onClick={() => openUpload(participanteNome, participanteClassificacao, tipo_, tLabel)}>
                + outro
              </button>
            )}
            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer select-none ml-1">
              <input type="checkbox" checked={na} disabled={naBusy} onChange={() => handleToggleNA(participanteNome, tipo_, !na)} className="rounded" />
              N/A
            </label>
          </div>
        </div>
        {/* Lista de arquivos deste tipo */}
        {typeDocs.length > 0 && (
          <div className="pb-2 pl-3 space-y-1">
            {typeDocs.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-green-700 bg-green-50 rounded px-1.5 py-0.5">Enviado</span>
                    {doc.classificadoPorIA && <IABadge small />}
                    <span className="text-xs text-gray-600 truncate">{doc.nome !== tLabel ? doc.nome : (doc.filename || doc.nome)}</span>
                  </div>
                  {doc.observacao && <div className="text-[11px] text-gray-400 mt-0.5">{doc.observacao}</div>}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button title="Visualizar" className="p-1.5 rounded hover:bg-white text-gray-400 hover:text-gray-700" onClick={() => setPreviewDoc({ docId: doc.id, nome: doc.nome })}>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  </button>
                  <button title="Reclassificar tipo / trocar dono" className="p-1.5 rounded hover:bg-white text-gray-400 hover:text-blue-600" onClick={() => setReclassifyDoc(doc)}>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button title="Excluir" className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" onClick={() => handleDeleteDoc(doc.id)} disabled={busyDel.has(doc.id)}>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function DocSection({ nome, displayName, classificacao, isLead, open, onToggle, onMoveUp, onMoveDown }: {
    nome: string | null; displayName: string; classificacao: string | null; isLead: boolean;
    open: boolean; onToggle: () => void;
    onMoveUp?: () => void; onMoveDown?: () => void;
  }) {
    const outros = outroDocs(docs, nome);
    return (
      <div className="mb-3 last:mb-0 rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Header clicável */}
        <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
          role="button" tabIndex={0} onClick={onToggle}>
          <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-blue-700">{(displayName[0] || "?").toUpperCase()}</span>
          </div>
          <span className="text-sm font-semibold text-gray-800 flex-1">{displayName}</span>
          {isLead && <span className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">Lead</span>}
          {classificacao && <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{classLabel(classificacao)}</span>}
          {/* Setas de reordenação */}
          <div className="flex items-center gap-0" onClick={e => e.stopPropagation()}>
            <button onClick={onMoveUp} disabled={!onMoveUp} title="Mover para cima"
              className="p-1 rounded transition-colors"
              style={{ color: onMoveUp ? "#4b5563" : "#d1d5db", cursor: onMoveUp ? "pointer" : "not-allowed" }}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            </button>
            <button onClick={onMoveDown} disabled={!onMoveDown} title="Mover para baixo"
              className="p-1 rounded transition-colors"
              style={{ color: onMoveDown ? "#4b5563" : "#d1d5db", cursor: onMoveDown ? "pointer" : "not-allowed" }}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
          <svg className={`h-4 w-4 text-gray-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
        {/* Conteúdo colapsável */}
        {open && <div className="border-t border-gray-100 px-4">
          {TIPOS_PADRAO.filter(t => t.value !== "OUTRO").map(t => (
            <TipoRow key={t.value} participanteNome={nome} participanteClassificacao={classificacao} tipo={t.value} tipoLabel={t.label} />
          ))}
          <div className="py-3 border-t border-gray-100">
            {outros.length > 0 && (
              <div className="mb-3 space-y-1">
                {outros.map(d => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {d.classificadoPorIA && <IABadge small />}
                        <span className="text-xs text-gray-700 truncate">{d.nome}</span>
                      </div>
                      {d.observacao && <div className="text-[11px] text-gray-400 mt-0.5">{d.observacao}</div>}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {d.url && <button title="Visualizar" className="p-1.5 rounded hover:bg-white text-gray-400 hover:text-gray-700" onClick={() => setPreviewDoc({ docId: d.id, nome: d.nome })}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </button>}
                      <button title="Reclassificar tipo / trocar dono" className="p-1.5 rounded hover:bg-white text-gray-400 hover:text-blue-600" onClick={() => setReclassifyDoc(d)}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button title="Excluir" className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" onClick={() => handleDeleteDoc(d.id)} disabled={busyDel.has(d.id)}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
              onClick={() => setUploadTarget({ participanteNome: nome, participanteClassificacao: classificacao, tipo: "OUTRO", tipoLabel: "Outro", existingDocId: null, isOutro: true })}>
              <span className="text-sm font-medium">+</span> Adicionar documento
            </button>
          </div>
        </div>}
      </div>
    );
  }

  // ─── Seção "Revisar e alocar" ────────────────────────────────────────────────

  const pending = pendingDocs(docs);
  const processing = processingDocs(docs);
  const inProgress = processing.filter(d => d.processingStatus === "EM_FILA" || d.processingStatus === "ANALISANDO");

  function ProcessingSection() {
    if (!processing.length) return null;
    return (
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
            IA acompanhando {processing.length} arquivo{processing.length > 1 ? "s" : ""}
          </span>
          {inProgress.length > 0 && (
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
              {inProgress.length} em processamento agora
            </span>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden divide-y divide-slate-200">
          {processing.map(d => (
            <div key={d.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0">
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-800 truncate">{d.filename || d.nome}</span>
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${processingStatusClass(d.processingStatus)}`}>
                      {processingStatusLabel(d.processingStatus)}
                    </span>
                    {d.aiConfidence && (
                      <span className="text-[11px] text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                        Confiança {d.aiConfidence.toLowerCase()}
                      </span>
                    )}
                  </div>
                  {d.processingStep && (
                    <div className="text-xs text-slate-500 mb-1">{d.processingStep}</div>
                  )}
                  {d.aiSummary ? (
                    <div className="text-xs text-gray-700 leading-5">{d.aiSummary}</div>
                  ) : (
                    <div className="text-xs text-gray-500">Arquivo aguardando retorno detalhado da IA.</div>
                  )}
                  {(d.aiExtractedName || d.aiDecision) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {d.aiExtractedName && (
                        <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-slate-600">
                          Nome: {d.aiExtractedName}
                        </span>
                      )}
                      {d.aiDecision && (
                        <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-slate-600">
                          Destino: {decisionLabel(d.aiDecision)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {d.url && (
                  <button className="text-xs text-blue-600 hover:underline shrink-0" onClick={() => setPreviewDoc({ docId: d.id, nome: d.filename || d.nome })}>
                    Ver
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function ReviewSection() {
    if (!pending.length) return null;
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
            ⚠ {pending.length} documento{pending.length > 1 ? "s" : ""} aguardando identificação
          </span>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden divide-y divide-amber-100">
          {pending.map(d => (
            <div key={d.id} className="px-4 py-3 flex items-center gap-3">
              <svg className="h-4 w-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <span className="text-sm text-gray-700 flex-1 truncate">{d.filename || d.nome}</span>
              <button
                className="text-xs text-blue-600 border border-blue-200 bg-white rounded-full px-3 py-1.5 hover:bg-blue-50 transition-colors shrink-0"
                onClick={() => setIdentifyDoc(d)}>
                Identificar DOC
              </button>
              <button className="text-gray-300 hover:text-red-400 shrink-0 p-1" onClick={() => handleDeleteDoc(d.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const leadDisplayName = lead ? ((lead.nomeCorreto ?? lead.nome) || "Lead") : "Lead";
  const leadSuggestions = buildCadastroSuggestions(docs, null, true);

  if (loading) return <AppShell title="Documentos"><div className="flex items-center justify-center h-64 text-gray-400 text-sm">Carregando...</div></AppShell>;
  if (error || !lead) return <AppShell title="Documentos"><div className="flex items-center justify-center h-64 text-red-500 text-sm">{error ?? "Lead não encontrado"}</div></AppShell>;

  return (
    <AppShell title={`Documentos — ${leadDisplayName}`}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <button onClick={() => router.push(`/leads/${leadId}`)} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Voltar ao lead
        </button>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">

          {/* ── Coluna esquerda: Documentos ──────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h1 className="text-base font-semibold text-gray-900">Documentos</h1>
                <p className="text-xs text-gray-400 mt-0.5">{leadDisplayName}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-full px-3 py-1.5 hover:bg-gray-50 transition-colors" onClick={() => setBulkOpen(true)}>
                  ↑ Subir vários
                </button>
                <button className="flex items-center gap-1.5 text-xs text-blue-600 border border-blue-200 rounded-full px-3 py-1.5 hover:bg-blue-50 transition-colors" onClick={() => setAddPartOpen(true)}>
                  + Participante
                </button>
              </div>
            </div>
            <div className="px-6 py-5">
              <ProcessingSection />
              <ReviewSection />
              <DocSection nome={null} displayName={leadDisplayName} classificacao={null} isLead={true}
                open={openDocs.has("__lead__")} onToggle={() => setOpenDocs(prev => { const s = new Set(prev); s.has("__lead__") ? s.delete("__lead__") : s.add("__lead__"); return s; })} />
              {participantes.map((p, idx) => (
                <DocSection key={p.id} nome={p.nome} displayName={p.nome} classificacao={p.classificacao} isLead={false}
                  open={openDocs.has(p.id)} onToggle={() => setOpenDocs(prev => { const s = new Set(prev); s.has(p.id) ? s.delete(p.id) : s.add(p.id); return s; })}
                  onMoveUp={idx > 0 ? () => movePerson(p.id, "up") : undefined}
                  onMoveDown={idx < participantes.length - 1 ? () => movePerson(p.id, "down") : undefined}
                />
              ))}
            </div>
          </div>

          {/* ── Coluna direita: Cadastro ──────────────────────────────────────── */}
          <div className="space-y-3">
            {/* Lead principal */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 cursor-pointer"
                role="button" tabIndex={0}
                onClick={() => setOpenCadastro(prev => { const s = new Set(prev); s.has("__lead__") ? s.delete("__lead__") : s.add("__lead__"); return s; })}>
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-blue-700">{(leadDisplayName[0] || "?").toUpperCase()}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{leadDisplayName}</span>
                  <span className="text-xs text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">Lead</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-xs text-blue-600 border border-blue-200 rounded-full px-2.5 py-1 hover:bg-blue-50 flex items-center gap-1 shrink-0"
                    onClick={e => { e.stopPropagation(); setAICadastroTarget({ participanteNome: null, displayName: leadDisplayName, isLead: true }); }}>
                    <IABadge small /> Cadastrar com IA
                  </button>
                  <svg className={`h-4 w-4 text-gray-400 transition-transform ${openCadastro.has("__lead__") ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
              {openCadastro.has("__lead__") && (
                <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                  <CadastroForm leadId={leadId} isLead={true} showFinanceiro={true}
                    initialValues={{
                      cpf: lead.cpf, rg: lead.rg, dataNascimento: fmtDate(lead.dataNascimento),
                      estadoCivil: lead.estadoCivil ?? "", naturalidade: lead.naturalidade,
                      profissao: lead.profissao, empresa: lead.empresa,
                      telefone: lead.telefone, email: lead.email,
                      endereco: lead.endereco, cep: lead.cep, cidade: lead.cidade, uf: lead.uf ?? "",
                      rendaBrutaFamiliar: fmtNum(lead.rendaBrutaFamiliar),
                      fgts: fmtNum(lead.fgts), valorEntrada: fmtNum(lead.valorEntrada),
                    }}
                    initialOrigem={(lead.cadastroOrigem as Record<string, string | null>) ?? {}}
                    aiSuggestions={leadSuggestions}
                  />
                </div>
              )}
            </div>

            {/* Participantes adicionais */}
            {participantes.map((p, idx) => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 cursor-pointer"
                  role="button" tabIndex={0}
                  onClick={() => setOpenCadastro(prev => { const s = new Set(prev); s.has(p.id) ? s.delete(p.id) : s.add(p.id); return s; })}>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-gray-600">{(p.nome[0] || "?").toUpperCase()}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-800 truncate">{p.nome}</span>
                    {p.classificacao && <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 shrink-0">{classLabel(p.classificacao)}</span>}
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <div className="flex items-center" onClick={e => e.stopPropagation()}>
                      <button disabled={idx === 0} onClick={() => movePerson(p.id, "up")} title="Mover para cima"
                        className="p-1 rounded transition-colors"
                        style={{ color: idx === 0 ? "#d1d5db" : "#4b5563", cursor: idx === 0 ? "not-allowed" : "pointer" }}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                      </button>
                      <button disabled={idx === participantes.length - 1} onClick={() => movePerson(p.id, "down")} title="Mover para baixo"
                        className="p-1 rounded transition-colors"
                        style={{ color: idx === participantes.length - 1 ? "#d1d5db" : "#4b5563", cursor: idx === participantes.length - 1 ? "not-allowed" : "pointer" }}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>
                    <button className="text-xs text-blue-600 border border-blue-200 rounded-full px-2.5 py-1 hover:bg-blue-50 flex items-center gap-1"
                      onClick={ev => { ev.stopPropagation(); setAICadastroTarget({ participanteNome: p.nome, participanteId: p.id, displayName: p.nome, isLead: false }); }}>
                      <IABadge small /> Cadastrar com IA
                    </button>
                    <button className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 px-1"
                      onClick={e => { e.stopPropagation(); handleRemoveParticipante(p.id); }} disabled={busyRemove.has(p.id)}>
                      {busyRemove.has(p.id) ? "..." : "Remover"}
                    </button>
                    <svg className={`h-4 w-4 text-gray-400 transition-transform ${openCadastro.has(p.id) ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
                {openCadastro.has(p.id) && (
                  <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                    <CadastroForm leadId={leadId} isLead={false} participanteId={p.id} showFinanceiro={false}
                      initialValues={{
                        cpf: p.cpf, rg: p.rg, dataNascimento: fmtDate(p.dataNascimento),
                        estadoCivil: p.estadoCivil ?? "", naturalidade: p.naturalidade,
                        profissao: p.profissao, empresa: p.empresa,
                        telefone: p.telefone, email: p.email,
                        endereco: p.endereco, cep: p.cep, cidade: p.cidade, uf: p.uf ?? "",
                        renda: fmtNum(p.renda),
                      }}
                      initialOrigem={(p.cadastroOrigem as Record<string, string | null>) ?? {}}
                      aiSuggestions={buildCadastroSuggestions(docs, p.nome, false)}
                    />
                  </div>
                )}
              </div>
            ))}

          </div>
        </div>
      </div>

      {/* Modal: upload único */}
      {uploadTarget && (
        <FileModal
          title={uploadTarget.isOutro ? "Adicionar documento" : `Upload — ${uploadTarget.tipoLabel}`}
          showNome={uploadTarget.isOutro} nomeDefault={uploadTarget.isOutro ? "" : uploadTarget.tipoLabel}
          onConfirm={handleUploadConfirm} onCancel={() => setUploadTarget(null)} busy={busyUpload}
        />
      )}

      {/* Modal: bulk upload + IA */}
      {bulkOpen && (
        <BulkUploadModal leadId={leadId}
          onDone={async () => {
            setBulkOpen(false);
            try { await Promise.all([reloadDocs(), reloadParts()]); } catch { /* silencioso */ }
          }}
          onCancel={() => setBulkOpen(false)}
        />
      )}

      {/* Modal: adicionar participante */}
      {addPartOpen && <AddParticipanteModal onConfirm={handleAddParticipante} onCancel={() => setAddPartOpen(false)} />}

      {/* Modal: AI cadastro validação */}
      {aiCadastroTarget && (
        <AICadastroModal
          leadId={leadId}
          participanteId={aiCadastroTarget.participanteId}
          participanteNome={aiCadastroTarget.participanteNome}
          displayName={aiCadastroTarget.displayName}
          isLead={aiCadastroTarget.isLead}
          onConfirm={handleAICadastroConfirm}
          onCancel={() => setAICadastroTarget(null)}
        />
      )}

      {/* Modal: preview de documento */}
      {previewDoc && (
        <PreviewModal
          leadId={leadId}
          docId={previewDoc.docId}
          nome={previewDoc.nome}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* Modal: identificar documento (preview + form) */}
      {identifyDoc && (
        <IdentifyDocModal
          leadId={leadId}
          doc={identifyDoc}
          participantes={participantes}
          onConfirm={handleIdentifyDoc}
          onCancel={() => setIdentifyDoc(null)}
          busy={busyIdentify}
        />
      )}

      {/* Modal: reclassificar tipo / trocar dono */}
      {reclassifyDoc && (
        <ReclassifyModal
          doc={reclassifyDoc}
          participantes={participantes}
          onConfirm={handleReclassify}
          onCancel={() => setReclassifyDoc(null)}
          busy={busyReclassify}
        />
      )}

      {/* Modal: confirmar exclusão de documento */}
      {confirmDeleteDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Excluir documento</h3>
            <p className="text-sm text-gray-600 mb-6">Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => setConfirmDeleteDocId(null)}
              >
                Cancelar
              </button>
              <button
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
                onClick={confirmDeleteDoc}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
