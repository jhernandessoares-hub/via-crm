"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  deleteProductDocument,
  getProduct,
  listProductDocuments,
  normalizeImageUrl,
  Product,
  ProductDocument,
  updateProduct,
  uploadProductDocument,
  uploadProductImage,
} from "@/lib/products.service";

type TabKey = "CADASTRO" | "DETALHES" | "DOCUMENTOS" | "MIDIAS" | "MARKETING";

type MacroOrigin = "DEVELOPMENT" | "THIRD_PARTY" | "OWN";
type ProductStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "RESERVED"
  | "SOLD"
  | "SOLD_OUT"
  | "ARCHIVED";

// Alinhado ao schema.prisma atual (sem CHACARA/AREA por enquanto)
type ProductType =
  | "EMPREENDIMENTO"
  | "LOTEAMENTO"
  | "APARTAMENTO"
  | "CASA"
  | "KITNET"
  | "SOBRADO"
  | "TERRENO"
  | "SALA_COMERCIAL"
  | "LOJA"
  | "SALAO_COMERCIAL"
  | "BARRACAO"
  | "OUTRO";

const TAB_ORDER: TabKey[] = ["CADASTRO", "DETALHES", "DOCUMENTOS", "MIDIAS", "MARKETING"];

const TYPES_DEVELOPMENT: ProductType[] = ["EMPREENDIMENTO", "LOTEAMENTO"];
const TYPES_THIRD_PARTY: ProductType[] = [
  "APARTAMENTO",
  "CASA",
  "KITNET",
  "SOBRADO",
  "TERRENO",
  "SALA_COMERCIAL",
  "LOJA",
  "SALAO_COMERCIAL",
  "BARRACAO",
  "OUTRO",
];

type DocType = "BOOK" | "MEMORIAL" | "TABELA";
type DocCategory = "ENTERPRISE" | "PROPERTY" | "OTHER";
type DocVisibility = "INTERNAL" | "SHAREABLE";

function labelTab(t: TabKey) {
  switch (t) {
    case "CADASTRO":
      return "Cadastro";
    case "DETALHES":
      return "Detalhes";
    case "DOCUMENTOS":
      return "Documentos";
    case "MIDIAS":
      return "Mídias";
    case "MARKETING":
      return "Marketing";
    default:
      return t;
  }
}

function labelOrigin(origin?: string) {
  switch (origin) {
    case "DEVELOPMENT":
      return "Empreendimento/Loteamento";
    case "THIRD_PARTY":
      return "Imóvel de terceiros";
    case "OWN":
      return "Próprio";
    default:
      return origin ?? "-";
  }
}

function labelType(t?: string) {
  switch (t) {
    case "EMPREENDIMENTO":
      return "Empreendimento";
    case "LOTEAMENTO":
      return "Loteamento";
    case "APARTAMENTO":
      return "Apartamento";
    case "CASA":
      return "Casa";
    case "KITNET":
      return "Kitnet";
    case "SOBRADO":
      return "Sobrado";
    case "TERRENO":
      return "Terreno";
    case "SALA_COMERCIAL":
      return "Sala comercial";
    case "LOJA":
      return "Loja";
    case "SALAO_COMERCIAL":
      return "Salão comercial";
    case "BARRACAO":
      return "Barracão / Galpão";
    case "OUTRO":
      return "Outro";
    default:
      return t ? t.replaceAll("_", " ") : "-";
  }
}

function labelStatus(s?: string) {
  switch (s) {
    case "ACTIVE":
      return "Ativo";
    case "INACTIVE":
      return "Inativo";
    case "RESERVED":
      return "Reservado";
    case "SOLD":
      return "Vendido";
    case "SOLD_OUT":
      return "Esgotado";
    case "ARCHIVED":
      return "Arquivado";
    default:
      return s ?? "-";
  }
}

function tabClass({ current, visited }: { current: boolean; visited: boolean }) {
  // 🟡 atual = amarelo
  if (current) return "border-amber-300 bg-amber-50 text-amber-900";
  // 🟢 visitado = verde
  if (visited) return "border-emerald-300 bg-emerald-50 text-emerald-900";
  // ⚪ não visitado = cinza
  return "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50";
}

function safeParseVisited(raw: string | null): { visited: TabKey[]; current?: TabKey } | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    const visited = Array.isArray(o?.visited) ? o.visited : [];
    const current = typeof o?.current === "string" ? o.current : undefined;
    const cleaned = visited.filter((x: any) => TAB_ORDER.includes(x));
    const curOk = current && TAB_ORDER.includes(current as any) ? (current as TabKey) : undefined;
    return { visited: cleaned as TabKey[], current: curOk };
  } catch {
    return null;
  }
}

function fmtDate(iso?: string) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function labelDocType(t?: string) {
  switch (t) {
    case "BOOK":
      return "Book";
    case "MEMORIAL":
      return "Memorial";
    case "TABELA":
      return "Tabela de preços";
    default:
      return t ?? "-";
  }
}

function guessCategoryFromOrigin(origin: MacroOrigin): DocCategory {
  return origin === "DEVELOPMENT" ? "ENTERPRISE" : "PROPERTY";
}

// Pega filename do header Content-Disposition: attachment; filename="x.pdf"
function filenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
  // tenta filename="..."
  const m1 = cd.match(/filename="([^"]+)"/i);
  if (m1?.[1]) return m1[1];
  // tenta filename=...
  const m2 = cd.match(/filename=([^;]+)/i);
  if (m2?.[1]) return m2[1].trim().replace(/^"|"$/g, "");
  return null;
}

export default function ProductEditPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [product, setProduct] = useState<Product | null>(null);

  // Wizard tabs
  const [tab, setTab] = useState<TabKey>("CADASTRO");
  const [visited, setVisited] = useState<Record<TabKey, boolean>>({
    CADASTRO: true,
    DETALHES: false,
    DOCUMENTOS: false,
    MIDIAS: false,
    MARKETING: false,
  });

  // Campos alinhados ao schema atual
  const [title, setTitle] = useState("");
  const [origin, setOrigin] = useState<MacroOrigin>("DEVELOPMENT");
  const [type, setType] = useState<ProductType>("EMPREENDIMENTO");
  const [status, setStatus] = useState<ProductStatus>("ACTIVE");

  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [price, setPrice] = useState<string>("");
  const [description, setDescription] = useState("");

  // Docs state
  const [docsLoading, setDocsLoading] = useState(false);
  const [docs, setDocs] = useState<ProductDocument[]>([]);
  const [docType, setDocType] = useState<DocType>("BOOK");
  const [docTitle, setDocTitle] = useState("");
  const [docNotes, setDocNotes] = useState("");
  const [docVisibility, setDocVisibility] = useState<DocVisibility>("INTERNAL");

  // ⚠️ Mantemos o checkbox na UI (porque faz sentido no produto),
  // mas por enquanto NÃO enviamos no multipart para evitar erro de boolean no backend.
  const [docAiExtractable, setDocAiExtractable] = useState(true);

  const [docFileUploading, setDocFileUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const storageKey = useMemo(() => (id ? `product.wizard.visited.v1.${id}` : ""), [id]);

  function persistWizard(nextTab: TabKey, nextVisited: Record<TabKey, boolean>) {
    if (!storageKey) return;
    try {
      const visitedList = TAB_ORDER.filter((k) => nextVisited[k]);
      localStorage.setItem(storageKey, JSON.stringify({ current: nextTab, visited: visitedList }));
    } catch {
      // ignore
    }
  }

  function goToTab(next: TabKey) {
    setTab(next);
    setVisited((prev) => {
      const nextVisited = { ...prev, [next]: true };
      persistWizard(next, nextVisited);
      return nextVisited;
    });
  }

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const p = await getProduct(id);
      setProduct(p);

      // Wizard restore
      if (storageKey) {
        const restored = safeParseVisited(localStorage.getItem(storageKey));
        if (restored) {
          const base: Record<TabKey, boolean> = {
            CADASTRO: false,
            DETALHES: false,
            DOCUMENTOS: false,
            MIDIAS: false,
            MARKETING: false,
          };
          for (const k of restored.visited) base[k] = true;
          base.CADASTRO = true;

          setVisited(base);
          setTab(restored.current ?? "CADASTRO");
        } else {
          persistWizard("CADASTRO", {
            CADASTRO: true,
            DETALHES: false,
            DOCUMENTOS: false,
            MIDIAS: false,
            MARKETING: false,
          });
        }
      }

      // Preencher campos (com fallback para legado)
      setTitle((p as any)?.title ?? (p as any)?.name ?? "");
      const o = (((p as any)?.origin ?? "DEVELOPMENT") as MacroOrigin);
      setOrigin(o);
      setType((((p as any)?.type ?? "EMPREENDIMENTO") as any) as ProductType);
      setStatus(((p as any)?.status ?? "ACTIVE") as ProductStatus);

      setCity((p as any)?.city ?? "");
      setNeighborhood((p as any)?.neighborhood ?? "");
      setDescription((p as any)?.description ?? "");

      const pr = (p as any)?.price;
      setPrice(pr === null || pr === undefined ? "" : String(pr));
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar produto");
    } finally {
      setLoading(false);
    }
  }

  async function loadDocs() {
    if (!id) return;
    setDocsLoading(true);
    setError(null);
    try {
      const arr = await listProductDocuments(id);
      setDocs(Array.isArray(arr) ? arr : []);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar documentos");
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Carrega docs quando entrar na aba
  useEffect(() => {
    if (tab === "DOCUMENTOS") {
      loadDocs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  // Ajusta options de type quando muda macro
  useEffect(() => {
    if (origin === "DEVELOPMENT") {
      if (!TYPES_DEVELOPMENT.includes(type)) setType("EMPREENDIMENTO");
      return;
    }
    if (origin === "THIRD_PARTY") {
      if (!TYPES_THIRD_PARTY.includes(type)) setType("CASA");
      return;
    }
  }, [origin]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = useMemo(() => {
    if (origin === "DEVELOPMENT") return TYPES_DEVELOPMENT;
    if (origin === "THIRD_PARTY") return TYPES_THIRD_PARTY;
    return [];
  }, [origin]);

  const canSave = useMemo(() => {
    if (loading || saving) return false;
    if (!title.trim()) return false;
    if (origin === "DEVELOPMENT") return TYPES_DEVELOPMENT.includes(type);
    if (origin === "THIRD_PARTY") return TYPES_THIRD_PARTY.includes(type);
    return true;
  }, [title, loading, saving, origin, type]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!id || !canSave) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const parsedPrice = price.trim() === "" ? undefined : Number(price.replace(",", "."));

      const payload: any = {
        title: title.trim(),
        origin,
        type,
        status,
        city: city.trim() || undefined,
        neighborhood: neighborhood.trim() || undefined,
        description: description.trim() || undefined,
        price: Number.isFinite(parsedPrice as number) ? (parsedPrice as number) : undefined,
      };

      const updated = await updateProduct(id, payload as any);
      setProduct(updated);
      setSuccess("Produto atualizado com sucesso.");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao salvar produto");
    } finally {
      setSaving(false);
    }
  }

  async function onUploadImage(file: File | null) {
    if (!id || !file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      await uploadProductImage(id, file);
      await load();
      setSuccess("Imagem enviada com sucesso.");
    } catch (e: any) {
      setError(e?.message ?? "Erro no upload (rota/campo pode estar diferente no backend)");
    } finally {
      setUploading(false);
    }
  }

  async function onUploadDoc(file: File | null) {
    if (!id || !file) return;

    setDocFileUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const category: DocCategory = guessCategoryFromOrigin(origin);

      // ✅ IMPORTANTE: por enquanto NÃO enviamos aiExtractable no multipart
      // porque o backend está validando boolean e o multipart manda string.
      await uploadProductDocument(id, {
        file,
        type: docType,
        category,
        title: docTitle.trim() || undefined,
        notes: docNotes.trim() || undefined,
        visibility: docVisibility,
        // aiExtractable: docAiExtractable,  // ⛔ removido por enquanto
      } as any);

      setDocTitle("");
      setDocNotes("");
      setSuccess("Documento enviado com sucesso.");
      await loadDocs();
      await load(); // atualiza product.documents se o backend retornar junto
    } catch (e: any) {
      setError(e?.message ?? "Erro ao enviar documento");
    } finally {
      setDocFileUploading(false);
    }
  }

  async function onDeleteDoc(docId: string) {
    if (!id) return;
    const ok = confirm("Tem certeza que deseja excluir este documento?");
    if (!ok) return;

    setError(null);
    setSuccess(null);

    try {
      await deleteProductDocument(id, docId);
      setSuccess("Documento removido.");
      await loadDocs();
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao excluir documento");
    }
  }

  // ✅ NOVO: Download autenticado via backend (com filename correto)
  async function onDownloadDoc(d: any) {
    if (!id) return;
    setError(null);
    setSuccess(null);

    try {
      const documentId = String(d?.id || "").trim();
      if (!documentId) throw new Error("Documento inválido (sem id)");

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
      const url = `${baseUrl}/products/${id}/documents/${documentId}/download`;

      // pega token do localStorage (padrão comum do seu app)
      const token =
        (typeof window !== "undefined" && (localStorage.getItem("token") || localStorage.getItem("accessToken"))) ||
        "";

      if (!token) {
        throw new Error("Token não encontrado no navegador. Faça login novamente.");
      }

      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error(t || `Falha no download (status ${resp.status})`);
      }

      const cd = resp.headers.get("content-disposition");
      const filenameHeader = filenameFromContentDisposition(cd);

      const fallbackBase =
        (d?.title && String(d.title).trim()) ||
        (d?.type && String(d.type).trim()) ||
        "documento";

      // se não vier filename, tenta deduzir pela content-type
      let filename = filenameHeader || fallbackBase;
      if (!filename.includes(".")) {
        const ct = resp.headers.get("content-type") || "application/octet-stream";
        let ext = "bin";
        if (ct.includes("pdf")) ext = "pdf";
        else if (ct.includes("image/jpeg")) ext = "jpg";
        else if (ct.includes("image/png")) ext = "png";
        else if (ct.includes("image/webp")) ext = "webp";
        filename = `${filename}.${ext}`;
      }

      const blob = await resp.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao baixar documento");
    }
  }

  const imageUrls = useMemo(() => {
    const imgs = ((product as any)?.images ?? []) as any[];
    const urls = imgs.map((img) => normalizeImageUrl(img)).filter(Boolean) as string[];
    return Array.from(new Set(urls));
  }, [product]);

  const headerTitle = useMemo(() => {
    if (loading) return "Produto";
    const t = (product as any)?.title ?? (product as any)?.name;
    return t ? String(t) : "Editar produto";
  }, [loading, product]);

  return (
    <AppShell title="Produto">
      <div className="mx-auto w-full max-w-6xl">
        {/* TOP */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{headerTitle}</h1>
            <p className="text-sm text-neutral-500">ID: {id}</p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/products"
              className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50"
            >
              Voltar
            </Link>
          </div>
        </div>

        {/* TABS (wizard) */}
        <div className="mb-4 flex flex-wrap gap-2">
          {TAB_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => goToTab(k)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm ${tabClass({
                current: tab === k,
                visited: visited[k],
              })}`}
            >
              {labelTab(k)}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* CONTEÚDO (abas) */}
          <form onSubmit={onSave} className="lg:col-span-2 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            {/* CADASTRO */}
            {tab === "CADASTRO" && (
              <>
                <h2 className="mb-4 text-lg font-semibold">Cadastro</h2>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-neutral-800">Título *</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex.: Residencial Vista Verde"
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                      disabled={loading}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-neutral-800">Macro tipo (origin) *</label>
                    <select
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value as MacroOrigin)}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                      disabled={loading}
                    >
                      <option value="DEVELOPMENT">Empreendimento/Loteamento</option>
                      <option value="THIRD_PARTY">Imóvel de terceiros</option>
                      <option value="OWN">Próprio</option>
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">
                      {origin === "OWN"
                        ? "OWN (Próprio) é opcional no seu modelo; você decide depois se vai usar."
                        : `Selecionado: ${labelOrigin(origin)}`}
                    </p>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-neutral-800">Tipo *</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as ProductType)}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                      disabled={loading || (origin !== "OWN" && typeOptions.length === 0)}
                    >
                      {origin === "OWN" && typeOptions.length === 0 ? (
                        <option value={type}>{labelType(type)}</option>
                      ) : (
                        typeOptions.map((t) => (
                          <option key={t} value={t}>
                            {labelType(t)}
                          </option>
                        ))
                      )}
                    </select>
                    {origin !== "OWN" && (
                      <p className="mt-1 text-xs text-neutral-500">
                        Opções filtradas automaticamente conforme o Macro tipo (Filtro B).
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-neutral-800">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ProductStatus)}
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                      disabled={loading}
                    >
                      <option value="ACTIVE">Ativo</option>
                      <option value="INACTIVE">Inativo</option>
                      <option value="RESERVED">Reservado</option>
                      <option value="SOLD">Vendido</option>
                      <option value="SOLD_OUT">Esgotado</option>
                      <option value="ARCHIVED">Arquivado</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* DETALHES */}
            {tab === "DETALHES" && (
              <>
                <h2 className="mb-4 text-lg font-semibold">Detalhes</h2>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-neutral-800">Cidade</label>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ex.: Campinas"
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-neutral-800">Bairro</label>
                    <input
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Ex.: Centro"
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                      disabled={loading}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-neutral-800">Preço</label>
                    <input
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Ex.: 499999.90"
                      inputMode="decimal"
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                      disabled={loading}
                    />
                    <p className="mt-1 text-xs text-neutral-500">Aceita ponto ou vírgula (ex.: 499999,90).</p>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-neutral-800">Descrição</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      placeholder="Descrição"
                      className="mt-1 w-full resize-y rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                      disabled={loading}
                    />
                  </div>
                </div>
              </>
            )}

            {/* DOCUMENTOS */}
            {tab === "DOCUMENTOS" && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Documentos</h2>
                  <button
                    type="button"
                    onClick={loadDocs}
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-neutral-50"
                    disabled={docsLoading}
                  >
                    {docsLoading ? "Atualizando..." : "Recarregar"}
                  </button>
                </div>

                <p className="mt-2 text-sm text-neutral-600">
                  Envie Book/Memorial/Tabela. Depois a IA vai extrair e pré-preencher os campos do empreendimento.
                </p>

                {/* Upload */}
                <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Tipo</label>
                      <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value as DocType)}
                        className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
                        disabled={docFileUploading || loading}
                      >
                        <option value="BOOK">Book</option>
                        <option value="MEMORIAL">Memorial</option>
                        <option value="TABELA">Tabela</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Visibilidade</label>
                      <select
                        value={docVisibility}
                        onChange={(e) => setDocVisibility(e.target.value as DocVisibility)}
                        className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
                        disabled={docFileUploading || loading}
                      >
                        <option value="INTERNAL">Interno</option>
                        <option value="SHAREABLE">Compartilhável</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                        Título (opcional)
                      </label>
                      <input
                        value={docTitle}
                        onChange={(e) => setDocTitle(e.target.value)}
                        placeholder="Ex.: Book oficial (versão 1)"
                        className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"
                        disabled={docFileUploading || loading}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                        Notas (opcional)
                      </label>
                      <input
                        value={docNotes}
                        onChange={(e) => setDocNotes(e.target.value)}
                        placeholder="Ex.: material recebido da incorporadora"
                        className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"
                        disabled={docFileUploading || loading}
                      />
                    </div>

                    <div className="sm:col-span-2 flex items-center gap-2">
                      <input
                        id="aiExtractable"
                        type="checkbox"
                        checked={docAiExtractable}
                        onChange={(e) => setDocAiExtractable(e.target.checked)}
                        className="h-4 w-4 rounded border-neutral-300"
                        disabled={docFileUploading || loading}
                      />
                      <label htmlFor="aiExtractable" className="text-sm text-neutral-800">
                        IA pode extrair dados deste documento
                      </label>
                    </div>

                    <div className="sm:col-span-2">
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        ⚠️ MVP: por enquanto esse checkbox não é enviado no upload (o backend valida boolean no multipart).
                        O default do banco é <b>true</b>. Depois a gente libera isso no backend.
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block">
                        <span className="text-sm font-medium text-neutral-800">Enviar arquivo</span>
                        <input
                          type="file"
                          className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-neutral-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-neutral-50"
                          disabled={docFileUploading || loading}
                          onChange={(e) => onUploadDoc(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      {docFileUploading && <div className="mt-2 text-sm text-neutral-600">Enviando...</div>}
                      <div className="mt-2 text-xs text-neutral-500">
                        Categoria será definida automaticamente conforme o Macro tipo (Empreendimento → ENTERPRISE, Terceiros → PROPERTY).
                      </div>
                    </div>
                  </div>
                </div>

                {/* Listagem */}
                <div className="mt-4">
                  {docsLoading ? (
                    <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
                      Carregando documentos...
                    </div>
                  ) : docs.length === 0 ? (
                    <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
                      Nenhum documento enviado ainda.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                      <div className="grid grid-cols-12 border-b border-neutral-200 bg-neutral-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                        <div className="col-span-3">Tipo</div>
                        <div className="col-span-5">Título</div>
                        <div className="col-span-2">Criado em</div>
                        <div className="col-span-2 text-right">Ações</div>
                      </div>

                      <div className="divide-y divide-neutral-100">
                        {docs.map((d) => (
                          <div key={d.id} className="grid grid-cols-12 items-center px-4 py-3 text-sm">
                            <div className="col-span-3 font-medium text-neutral-900">
                              {labelDocType((d as any).type)}
                            </div>

                            <div className="col-span-5">
                              <div className="text-neutral-900">{(d as any).title || "-"}</div>
                              <div className="mt-1 text-xs text-neutral-500">
                                {(d as any).visibility ? `Vis: ${(d as any).visibility}` : ""}{" "}
                                {(d as any).aiExtractable === false ? " • IA: NÃO" : ""}
                              </div>
                            </div>

                            <div className="col-span-2 text-xs text-neutral-600">
                              {fmtDate((d as any).createdAt)}
                            </div>

                            <div className="col-span-2 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => onDownloadDoc(d as any)}
                                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-neutral-50"
                              >
                                Baixar
                              </button>

                              <button
                                type="button"
                                onClick={() => onDeleteDoc((d as any).id)}
                                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* MIDIAS */}
            {tab === "MIDIAS" && (
              <>
                <h2 className="mb-2 text-lg font-semibold">Mídias</h2>
                <p className="mb-4 text-xs text-neutral-500">
                  Upload MVP (assumindo{" "}
                  <code className="rounded bg-neutral-100 px-1">POST /products/:id/images</code> com campo{" "}
                  <code className="rounded bg-neutral-100 px-1">file</code>).
                </p>

                <label className="block">
                  <span className="text-sm font-medium text-neutral-800">Enviar nova imagem</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-neutral-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-neutral-50"
                    disabled={uploading || loading}
                    onChange={(e) => onUploadImage(e.target.files?.[0] ?? null)}
                  />
                </label>

                <div className="mt-4">
                  {uploading && <div className="text-sm text-neutral-600">Enviando...</div>}

                  {!uploading && imageUrls.length === 0 ? (
                    <div className="text-sm text-neutral-600">Nenhuma imagem cadastrada.</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {imageUrls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="group overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50"
                          title="Abrir imagem"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt="Product image"
                            className="h-28 w-full object-cover transition-transform group-hover:scale-[1.02]"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* MARKETING */}
            {tab === "MARKETING" && (
              <>
                <h2 className="mb-2 text-lg font-semibold">Marketing</h2>
                <p className="text-sm text-neutral-600">
                  Aqui entra: IA gera textos + recomenda imagens/vídeos. Campanhas vinculadas aparecem como leitura e link para abrir.
                </p>

                <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                  MVP agora: bloco de marketing/campanhas entra no próximo passo.
                </div>
              </>
            )}

            {/* ACTIONS */}
            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={load}
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50"
                disabled={loading || saving}
              >
                Recarregar
              </button>

              <button
                type="submit"
                disabled={!canSave}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>

          {/* LATERAL: RESUMO / AUDITORIA */}
          <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Resumo</h2>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">Macro</span>
                <span className="font-medium text-neutral-900">{labelOrigin(origin)}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">Tipo</span>
                <span className="font-medium text-neutral-900">{labelType(type)}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">Status</span>
                <span className="font-medium text-neutral-900">{labelStatus(status)}</span>
              </div>

              <div className="pt-3 border-t border-neutral-100">
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Auditoria</div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">Criado em</span>
                  <span className="font-medium text-neutral-900">
                    {(product as any)?.createdAt ? fmtDate((product as any).createdAt) : "-"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">Atualizado em</span>
                  <span className="font-medium text-neutral-900">
                    {(product as any)?.updatedAt ? fmtDate((product as any).updatedAt) : "-"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">Capturado por</span>
                  <span className="font-medium text-neutral-900">
                    {(product as any)?.capturedByUserId ?? "-"}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-neutral-100">
                <div className="text-xs text-neutral-500">
                  Progresso das abas é salvo no navegador (localStorage) por produto.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}