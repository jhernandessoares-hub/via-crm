"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  deleteProductDocument,
  deleteProductImage,
  setPrimaryProductImage,
  getProduct,
  listProductDocuments,
  normalizeImageUrl,
  ProductDocument,
  updateProduct,
  uploadProductDocument,
  uploadProductImage,
} from "@/lib/products.service";

// ─── Types ───────────────────────────────────────────────────────────────────

type DevCondition = "NA_PLANTA" | "EM_CONSTRUCAO" | "PRONTO";
type DevStandard = "ECONOMICO" | "MEDIO" | "ALTO" | "LUXO";

type VisitLocation = {
  _key: string;
  type: "STAND" | "ESCRITORIO" | "OUTRO";
  address: string;
  label: string;
  primary: boolean;
};

const VISIT_LOCATION_TYPE_LABELS: Record<VisitLocation["type"], string> = {
  STAND: "Plantão de Vendas",
  ESCRITORIO: "Escritório",
  OUTRO: "Outro",
};

type UnitSpec = {
  _key: string;
  bedrooms: string;
  suites: string;
  livingRooms: string;
  acPoints: string;
  areaM2: string;
  features: string[];
};

function unitSpecTitle(spec: UnitSpec, idx: number): string {
  const parts: string[] = [];
  if (spec.bedrooms) {
    const n = parseInt(spec.bedrooms);
    parts.push(`${n} Dormitório${n !== 1 ? "s" : ""}`);
  }
  if (spec.suites) {
    const n = parseInt(spec.suites);
    parts.push(`(${n} Suíte${n !== 1 ? "s" : ""})`);
  }
  if (spec.areaM2) parts.push(`${spec.areaM2} m²`);
  const detail = parts.join(" ");
  return `TIPO ${idx + 1}${detail ? " — " + detail : ""}`;
}

const UNIT_FEATURE_SUGGESTIONS = [
  "Varanda", "Varanda gourmet", "Sacada",
  "Entrega com piso", "Piso porcelanato", "Piso elevado",
  "Lavabo", "Copa", "Área de serviço",
  "Dependência de serviço", "Closet", "Banheira na suíte",
  "Churrasqueira na varanda", "Cozinha americana",
  "Ponto de gás", "Armários planejados",
  "Depósito / Storage", "Automação residencial",
  "Tomadas USB", "Janela piso-teto",
];

const EMPTY_UNIT_SPEC = (n: number): UnitSpec => ({
  _key: `${Date.now()}_${n}`,
  bedrooms: "", suites: "", livingRooms: "", acPoints: "", areaM2: "", features: [],
});

type FormData = {
  // S1
  title: string;
  condition: DevCondition | "";
  standard: DevStandard | "";
  // S2 - localização
  zipCode: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  referencePoint: string;
  // S2.1 - informações
  developer: string;
  totalUnits: string;
  totalTowers: string;
  floorsPerTower: string;
  deliveryForecast: string;
  landAreaM2: string;
  unitTypes: string[];
  condoFeatures: string[];
  technicalDescription: string;
  commercialDescription: string;
  // S3 - valores e condições
  price: string;
  minBuyerIncome: string;
  buyerIncomeLimit: string;
  acceptsFGTS: boolean;
  acceptsFinancing: boolean;
  acceptsDirectFinancing: boolean;
  acceptsTradeIn: boolean;
  tradeInTypes: string[];
  minEntryValue: string;
  acceptsInstallmentEntry: boolean;
  installmentEntryMonths: string;
  paymentConditions: string;
  priceReviewDays: string;
};

const EMPTY: FormData = {
  title: "", condition: "", standard: "",
  zipCode: "", street: "", streetNumber: "", complement: "",
  neighborhood: "", city: "", state: "", referencePoint: "",
  developer: "", totalUnits: "", totalTowers: "", floorsPerTower: "",
  deliveryForecast: "", landAreaM2: "", unitTypes: [], condoFeatures: [],
  technicalDescription: "", commercialDescription: "",
  price: "", minBuyerIncome: "", buyerIncomeLimit: "",
  acceptsFGTS: false, acceptsFinancing: false, acceptsDirectFinancing: false, acceptsTradeIn: false,
  tradeInTypes: [], minEntryValue: "", acceptsInstallmentEntry: false, installmentEntryMonths: "", paymentConditions: "", priceReviewDays: "",
};

const CONDO_FEATURES = [
  "Piscina", "Academia", "Salão de festas", "Playground",
  "Churrasqueira", "Quadra esportiva", "Portaria 24h", "Elevador",
  "Pet friendly", "Coworking", "Espaço gourmet", "Brinquedoteca",
  "Sauna", "Spa", "Gerador", "Energia solar", "Bike sharing",
];

const SOCIAL_PROGRAMS = [
  "MCMV", "Casa Paulista", "Casa Mineira", "Casa Verde e Amarela",
  "Prefeitura", "Outro",
];

const TRADE_IN_TYPES = ["Carro", "Imóvel", "Terreno"];

const UNIT_TYPES_LOTEAMENTO = ["Residencial", "Comercial", "Industrial", "Mista", "Rural"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCurrency(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const commaIdx = t.lastIndexOf(",");
  const dotIdx = t.lastIndexOf(".");
  let n: number;
  if (commaIdx > dotIdx) {
    n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  } else if (dotIdx > commaIdx) {
    const afterDot = t.slice(dotIdx + 1);
    n = afterDot.length === 2 ? parseFloat(t.replace(/,/g, "")) : parseFloat(t.replace(/\./g, ""));
  } else {
    n = parseFloat(t);
  }
  return Number.isFinite(n) ? n : undefined;
}

function fmtBRL(raw: string): string {
  const n = parseCurrency(raw);
  if (n === undefined) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatAIValue(val: any): string {
  if (val == null) return "—";
  if (Array.isArray(val)) return val.length ? val.join(", ") : "—";
  const s = String(val);
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

const AI_FIELD_LABELS: Record<string, string> = {
  developer: "Construtora", totalUnits: "Total unidades", totalTowers: "Torres",
  floorsPerTower: "Andares/torre", privateAreaMinM2: "Área min (m²)", privateAreaMaxM2: "Área max (m²)",
  parkingMin: "Vagas min", parkingMax: "Vagas max", deliveryForecast: "Entrega",
  unitTypes: "Tipos de unidade", condoFeatures: "Lazer", technicalDescription: "Desc. técnica",
  commercialDescription: "Desc. comercial", landAreaM2: "Área terreno", price: "Preço",
  city: "Cidade", state: "Estado", neighborhood: "Bairro",
  minBuyerIncome: "Renda mínima", buyerIncomeLimit: "Renda máxima",
  acceptsFGTS: "Aceita FGTS", acceptsFinancing: "Financiamento Bancário", acceptsDirectFinancing: "Financiamento Direto c/ Incorporadora",
  paymentConditions: "Condições de pagamento",
  bedrooms: "Quartos", suites: "Suítes", livingRooms: "Salas",
  hasBalcony: "Varanda", acPoints: "Pontos de A/C",
  flooringIncluded: "Entrega com piso", hasLavabo: "Lavabo", hasPantry: "Copa",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  BOOK: "Book de Vendas",
  MEMORIAL: "Memorial Descritivo",
  TABELA: "Tabela de Preços",
  PLANTA: "Planta",
  OUTROS: "Outro documento",
};

// ─── UI helpers ──────────────────────────────────────────────────────────────

const inp = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-400";
const sel = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-400 bg-[var(--shell-card-bg)]";


function Section({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-[var(--shell-card-bg)] overflow-hidden">
      <button type="button" onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-[var(--shell-bg)] transition-colors">
        <span className="text-sm font-semibold text-[var(--shell-text)]">{title}</span>
        <span className="text-[var(--shell-subtext)] text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="border-t px-5 py-5 space-y-4">{children}</div>}
    </div>
  );
}

function Field({ label, ai, onClearAI, children }: {
  label: string; ai?: boolean; onClearAI?: () => void; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <label className="text-xs font-medium text-[var(--shell-subtext)]">{label}</label>
        {ai && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
            ✦ IA
            {onClearAI && (
              <button type="button" onClick={onClearAI} className="ml-0.5 text-violet-400 hover:text-violet-700 leading-none">×</button>
            )}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function CurrencyInput({ value, onChange, placeholder = "0,00", disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
}) {
  return (
    <div className="flex w-full items-center rounded-lg border focus-within:border-slate-400 overflow-hidden">
      <span className="pl-3 text-sm text-[var(--shell-subtext)] select-none shrink-0">R$</span>
      <input
        key={value}
        defaultValue={fmtBRL(value)}
        onBlur={(e) => {
          const n = parseCurrency(e.target.value);
          const normalized = n !== undefined ? String(n) : "";
          e.target.value = fmtBRL(normalized) || e.target.value;
          onChange(normalized);
        }}
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 py-2 pr-3 pl-1.5 text-sm outline-none bg-transparent min-w-0"
      />
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        checked ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] text-[var(--shell-subtext)] hover:border-slate-400"
      }`}>
      <span className={`inline-block w-3.5 h-3.5 rounded-sm border ${checked ? "bg-[var(--shell-card-bg)] border-white" : "border-gray-400"}`}>
        {checked && <span className="block w-full h-full flex items-center justify-center text-slate-900 text-[9px] font-bold leading-none">✓</span>}
      </span>
      {label}
    </button>
  );
}

function TagInput({ value, onChange, suggestions, ai, onClearAI, disabled }: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  ai?: boolean;
  onClearAI?: () => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");

  function add(tag: string) {
    const t = tag.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput("");
  }

  function remove(tag: string) {
    onChange(value.filter((v) => v !== tag));
    if (onClearAI) onClearAI();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((tag) => (
          <span key={tag} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            ai ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"
          }`}>
            {tag}
            {!disabled && (
              <button type="button" onClick={() => remove(tag)} className="ml-0.5 opacity-60 hover:opacity-100 leading-none">×</button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ";") { e.preventDefault(); add(input); }
              if (e.key === "Backspace" && !input && value.length) remove(value[value.length - 1]);
            }}
            placeholder="Digite e pressione Enter para adicionar..."
            className={inp}
          />
          {suggestions && suggestions.filter((s) => !value.includes(s)).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {suggestions.filter((s) => !value.includes(s)).map((s) => (
                <button key={s} type="button" onClick={() => add(s)}
                  className="rounded-full border border-dashed px-2 py-0.5 text-xs text-[var(--shell-subtext)] hover:border-slate-400 hover:text-[var(--shell-subtext)]">
                  + {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoteamentoEditPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productType, setProductType] = useState("EMPREENDIMENTO");
  const [publicationStatus, setPublicationStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const [form, setForm] = useState<FormData>(EMPTY);
  const [unitSpecs, setUnitSpecs] = useState<UnitSpec[]>([]);
  const [minimizedSpecs, setMinimizedSpecs] = useState<Set<string>>(new Set());
  const [visitLocations, setVisitLocations] = useState<VisitLocation[]>([]);
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Docs
  const [docs, setDocs] = useState<ProductDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // Image upload state
  const [productImages, setProductImages] = useState<any[]>([]);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgTitle, setImgTitle] = useState("");
  const [capturedByUserId, setCapturedByUserId] = useState<string | null>(null);
  const [capturedBy, setCapturedBy] = useState<any | null>(null);
  const [showRequestDeleteModal, setShowRequestDeleteModal] = useState(false);
  const [requestingDelete, setRequestingDelete] = useState(false);

  // Plant upload state
  const [plantName, setPlantName] = useState("");
  const [plantArea, setPlantArea] = useState("");
  const [plantUploading, setPlantUploading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [showPlantForm, setShowPlantForm] = useState(false);
  const plantFileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);

  // AI extract state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<string>("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, any> | null>(null);
  const [aiLastExtracted, setAiLastExtracted] = useState<Record<string, any> | null>(null);
  const [aiPanelMinimized, setAiPanelMinimized] = useState(false);

  // Save modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Role
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) { const u = JSON.parse(raw); setUserRole(u.role ?? null); setUserId(u.id ?? null); }
    } catch {}
  }, []);

  // Sections
  const [open, setOpen] = useState<Set<string>>(new Set(["identificacao", "documentacao", "informacoes", "especificacoes"]));
  function toggle(s: string) {
    setOpen((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }

  const f = (patch: Partial<FormData>) => setForm((p) => ({ ...p, ...patch }));

  function clearAI(field: string) {
    setAiFields((p) => { const n = new Set(p); n.delete(field); return n; });
  }

  function patchUnitSpec(key: string, patch: Partial<UnitSpec>) {
    setUnitSpecs((prev) => prev.map((s) => s._key === key ? { ...s, ...patch } : s));
  }

  function toggleArr(field: "condoFeatures" | "unitTypes" | "tradeInTypes", val: string) {
    setForm((p) => {
      const arr = p[field] as string[];
      return { ...p, [field]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
    });
  }

  // ── Load ────────────────────────────────────────────────────────────────────
  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const p = await getProduct(id);
      const pa = p as any;

      if (pa.type !== "LOTEAMENTO") {
        if (pa.type === "EMPREENDIMENTO") router.replace(`/products/${id}/empreendimento`);
        else router.replace(`/products/${id}`);
        return;
      }

      setProductType("LOTEAMENTO");
      setPublicationStatus(pa.publicationStatus === "PUBLISHED" ? "PUBLISHED" : "DRAFT");

      setForm({
        title: pa.title ?? "",
        condition: pa.condition ?? "",
        standard: pa.standard ?? "",
        zipCode: pa.zipCode ?? "",
        street: pa.street ?? "",
        streetNumber: pa.streetNumber ?? "",
        complement: pa.complement ?? "",
        neighborhood: pa.neighborhood ?? "",
        city: pa.city ?? "",
        state: pa.state ?? "",
        referencePoint: pa.referencePoint ?? "",
        developer: pa.developer ?? "",
        totalUnits: pa.totalUnits != null ? String(pa.totalUnits) : "",
        totalTowers: pa.totalTowers != null ? String(pa.totalTowers) : "",
        floorsPerTower: pa.floorsPerTower != null ? String(pa.floorsPerTower) : "",
        deliveryForecast: pa.deliveryForecast ?? "",
        landAreaM2: pa.landAreaM2 != null ? String(pa.landAreaM2) : "",
        unitTypes: Array.isArray(pa.unitTypes) ? pa.unitTypes : [],
        condoFeatures: Array.isArray(pa.condoFeatures) ? pa.condoFeatures : [],
        technicalDescription: pa.technicalDescription ?? "",
        commercialDescription: pa.commercialDescription ?? "",
        price: pa.price != null ? String(pa.price) : "",
        minBuyerIncome: pa.minBuyerIncome != null ? String(pa.minBuyerIncome) : "",
        buyerIncomeLimit: pa.buyerIncomeLimit != null ? String(pa.buyerIncomeLimit) : "",
        acceptsFGTS: pa.acceptsFGTS ?? false,
        acceptsFinancing: pa.acceptsFinancing ?? false,
        acceptsDirectFinancing: pa.acceptsDirectFinancing ?? false,
        acceptsTradeIn: pa.acceptsTradeIn ?? false,
        tradeInTypes: Array.isArray(pa.tradeInTypes) ? pa.tradeInTypes : [],
        minEntryValue: pa.minEntryValue != null ? String(pa.minEntryValue) : "",
        acceptsInstallmentEntry: pa.installmentEntryMonths != null && pa.installmentEntryMonths > 0,
        installmentEntryMonths: pa.installmentEntryMonths != null ? String(pa.installmentEntryMonths) : "",
        paymentConditions: pa.paymentConditions ?? "",
        priceReviewDays: pa.priceReviewDays != null ? String(pa.priceReviewDays) : "",
      });

      setProductImages(Array.isArray(pa.images) ? pa.images : []);
      setCapturedByUserId(pa.capturedByUserId ?? null);
      setCapturedBy(pa.capturedBy ?? null);

      if (pa.aiGeneratedFields && typeof pa.aiGeneratedFields === "object") {
        setAiFields(new Set(Object.keys(pa.aiGeneratedFields).filter((k) => pa.aiGeneratedFields[k])));
      }

      // unitSpecs
      // visitLocations
      const rawVisit = Array.isArray(pa.visitLocations) ? pa.visitLocations : [];
      setVisitLocations(rawVisit.map((v: any, i: number) => ({
        _key: `vl_${i}_${Date.now()}`,
        type: v.type ?? "STAND",
        address: v.address ?? "",
        label: v.label ?? "",
        primary: v.primary ?? (i === 0),
      })));

      const rawSpecs = Array.isArray(pa.unitSpecs) ? pa.unitSpecs : [];
      setUnitSpecs(rawSpecs.map((s: any, i: number) => ({
        _key: `loaded_${i}_${Date.now()}`,
        bedrooms: s.bedrooms != null ? String(s.bedrooms) : "",
        suites: s.suites != null ? String(s.suites) : "",
        livingRooms: s.livingRooms != null ? String(s.livingRooms) : "",
        acPoints: s.acPoints != null ? String(s.acPoints) : "",
        areaM2: s.areaM2 != null ? String(s.areaM2) : "",
        features: Array.isArray(s.features) ? s.features : [],
      })));
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function loadDocs() {
    if (!id) return;
    setDocsLoading(true);
    try {
      const arr = await listProductDocuments(id);
      setDocs(Array.isArray(arr) ? arr : []);
    } catch { /* silent */ } finally { setDocsLoading(false); }
  }

  async function onUploadImage(file: File | null) {
    if (!id || !file) return;
    setImgUploading(true);
    setError(null);
    try {
      const res = await uploadProductImage(id, file, {
        title: imgTitle.trim() || undefined,
        customLabel: imgTitle.trim() || undefined,
      });
      setImgTitle("");
      if (res?.image) setProductImages((prev) => [...prev, res.image]);
      else await load();
      setSuccess("Imagem enviada.");
    } catch (e: any) {
      setError(e?.message ?? "Erro no upload");
    } finally { setImgUploading(false); }
  }

  async function downloadImage(url: string, filename: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename || "imagem";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  }

  async function onDeleteImage(imageId: string) {
    if (!id || !confirm("Excluir esta imagem?")) return;
    try {
      await deleteProductImage(id, imageId);
      setProductImages((prev) => prev.filter((img: any) => img.id !== imageId));
    } catch (e: any) {
      setError(e?.message ?? "Erro ao excluir imagem");
    }
  }

  async function onSetPrimaryImage(imageId: string) {
    if (!id) return;
    try {
      await setPrimaryProductImage(id, imageId);
      setProductImages((prev) =>
        prev.map((img: any) => ({ ...img, isPrimary: img.id === imageId }))
      );
    } catch (e: any) {
      setError(e?.message ?? "Erro ao definir capa");
    }
  }

  async function handleToggleImagePublic(imageId: string, currentPublishSite: boolean) {
    if (!id) return;
    setProductImages((prev) =>
      prev.map((img: any) => img.id === imageId ? { ...img, publishSite: !currentPublishSite } : img)
    );
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      await fetch(`${API}/products/${id}/images/${imageId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ publishSite: !currentPublishSite }),
      });
    } catch {
      setProductImages((prev) =>
        prev.map((img: any) => img.id === imageId ? { ...img, publishSite: currentPublishSite } : img)
      );
    }
  }

  useEffect(() => {
    load();
    loadDocs();
    // Restore AI reading from localStorage
    if (id && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`aiLastExtracted_${id}`);
        if (stored) setAiLastExtracted(JSON.parse(stored));
      } catch { /* ignore */ }
    }
  }, [id]); // eslint-disable-line

  // ── ViaCEP ──────────────────────────────────────────────────────────────────
  async function fetchCep(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) return;
      f({ street: data.logradouro || "", neighborhood: data.bairro || "", city: data.localidade || "", state: data.uf || "" });
    } catch { /* silent */ }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function doSave(publicationStatus: "DRAFT" | "PUBLISHED") {
    if (!id) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    setShowSaveModal(false);
    try {
      const aiObj: Record<string, boolean> = {};
      aiFields.forEach((k) => { aiObj[k] = true; });

      await updateProduct(id, {
        title: form.title.trim(),
        condition: form.condition || null,
        standard: form.standard || null,
        zipCode: form.zipCode || null,
        street: form.street || null,
        streetNumber: form.streetNumber || null,
        complement: form.complement || null,
        neighborhood: form.neighborhood || null,
        city: form.city || null,
        state: form.state || null,
        referencePoint: form.referencePoint || null,
        developer: form.developer || null,
        totalUnits: form.totalUnits ? parseInt(form.totalUnits) : null,
        totalTowers: form.totalTowers ? parseInt(form.totalTowers) : null,
        floorsPerTower: form.floorsPerTower ? parseInt(form.floorsPerTower) : null,
        deliveryForecast: form.deliveryForecast || null,
        landAreaM2: form.landAreaM2 ? parseInt(form.landAreaM2) : null,
        unitTypes: form.unitTypes,
        condoFeatures: form.condoFeatures,
        technicalDescription: form.technicalDescription || null,
        commercialDescription: form.commercialDescription || null,
        visitLocations: visitLocations.map(({ _key, ...rest }) => rest),
        unitSpecs: unitSpecs.map(({ _key, ...rest }) => ({
          bedrooms: rest.bedrooms ? parseInt(rest.bedrooms) : null,
          suites: rest.suites ? parseInt(rest.suites) : null,
          livingRooms: rest.livingRooms ? parseInt(rest.livingRooms) : null,
          acPoints: rest.acPoints ? parseInt(rest.acPoints) : null,
          areaM2: rest.areaM2 ? parseFloat(rest.areaM2) : null,
          features: rest.features,
        })),
        price: parseCurrency(form.price) ?? null,
        minBuyerIncome: parseCurrency(form.minBuyerIncome) ?? null,
        buyerIncomeLimit: parseCurrency(form.buyerIncomeLimit) ?? null,
        acceptsFGTS: form.acceptsFGTS,
        acceptsFinancing: form.acceptsFinancing,
        acceptsDirectFinancing: form.acceptsDirectFinancing,
        acceptsTradeIn: form.acceptsTradeIn,
        tradeInTypes: form.tradeInTypes,
        minEntryValue: parseCurrency(form.minEntryValue) ?? null,
        installmentEntryMonths: form.installmentEntryMonths ? parseInt(form.installmentEntryMonths) : null,
        paymentConditions: form.paymentConditions || null,
        priceReviewDays: form.priceReviewDays ? parseInt(form.priceReviewDays) : null,
        aiGeneratedFields: aiFields.size > 0 ? aiObj : null,
        publicationStatus,
        status: "ACTIVE",
      });
      router.push("/products");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
    const token = typeof window !== "undefined" ? (localStorage.getItem("accessToken") || "") : "";
    try {
      const res = await fetch(`${API}/products/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      router.push("/products");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao excluir");
      setShowDeleteConfirm(false);
    } finally { setDeleting(false); }
  }

  async function handleRequestDelete() {
    if (!id) return;
    setRequestingDelete(true);
    try {
      const { apiFetch } = await import("@/lib/api");
      await apiFetch(`/products/${id}/request-delete`, { method: "POST" });
      setSuccess("Solicitação enviada. MANAGER ou OWNER receberão a notificação.");
      setShowRequestDeleteModal(false);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao solicitar exclusão");
    } finally { setRequestingDelete(false); }
  }

  // ── Document upload ──────────────────────────────────────────────────────────
  async function handleDocUpload(file: File, type: "BOOK" | "MEMORIAL") {
    if (!id) return;
    setDocUploading(true);
    try {
      await uploadProductDocument(id, { file, type, category: "ENTERPRISE" });
      await loadDocs();
      setSuccess("Documento enviado.");
    } catch (e: any) { setError(e?.message ?? "Erro no upload"); }
    finally { setDocUploading(false); if (docFileRef.current) docFileRef.current.value = ""; }
  }

  async function handlePlantUpload(file: File) {
    if (!id || !plantName.trim()) return;
    setPlantUploading(true);
    try {
      await uploadProductDocument(id, {
        file, type: "PLANTA", category: "ENTERPRISE",
        title: plantName.trim(),
        notes: plantArea.trim() || undefined,
      });
      await loadDocs();
      setPlantName(""); setPlantArea(""); setShowPlantForm(false);
      setSuccess("Planta enviada.");
    } catch (e: any) { setError(e?.message ?? "Erro no upload da planta"); }
    finally { setPlantUploading(false); if (plantFileRef.current) plantFileRef.current.value = ""; }
  }

  async function handleDeleteDoc(docId: string) {
    if (!id || !confirm("Excluir este documento?")) return;
    try {
      await deleteProductDocument(id, docId);
      setDocs((p) => p.filter((d) => d.id !== docId));
    } catch (e: any) { setError(e?.message ?? "Erro ao excluir"); }
  }

  // ── AI extract ───────────────────────────────────────────────────────────────
  async function handleAIExtract() {
    if (!id) { setAiError("ID do produto não encontrado. Recarregue a página."); return; }
    setAiLoading(true);
    setAiError(null);
    setAiStatus("Baixando documentos...");
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
      const token = typeof window !== "undefined" ? (localStorage.getItem("accessToken") || "") : "";
      setAiStatus("Lendo e interpretando com IA...");
      const res = await fetch(`${API}/products/${id}/ai/extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { /* raw text */ }
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? text ?? `Erro ${res.status}`);
      if (data?.extracted) {
        setAiSuggestions(data.extracted);
        setAiLastExtracted(data.extracted);
        if (id && typeof window !== "undefined") {
          try { localStorage.setItem(`aiLastExtracted_${id}`, JSON.stringify(data.extracted)); } catch { /* ignore */ }
        }
        setAiStatus("");
      } else {
        setAiError("A IA não retornou sugestões. Verifique se os documentos têm texto extraível.");
        setAiStatus("");
      }
    } catch (e: any) {
      setAiError(e?.message ?? "Erro ao processar documentos com IA");
      setAiStatus("");
    } finally { setAiLoading(false); }
  }

  function applyAISuggestions() {
    if (!aiSuggestions) return;
    const s = aiSuggestions;
    const newAI = new Set<string>(aiFields);

    function applyStr(field: keyof FormData, val: any) {
      if (val != null && val !== "") { setForm((p) => ({ ...p, [field]: String(val) })); newAI.add(field); }
    }
    function applyInt(field: keyof FormData, val: any) {
      if (val != null && Number.isFinite(Number(val))) { setForm((p) => ({ ...p, [field]: String(Math.round(Number(val))) })); newAI.add(field); }
    }
    function applyNum(field: keyof FormData, val: any) {
      if (val != null && Number.isFinite(Number(val))) { setForm((p) => ({ ...p, [field]: String(Number(val)) })); newAI.add(field); }
    }
    function applyArr(field: "unitTypes" | "condoFeatures", val: any) {
      if (Array.isArray(val) && val.length > 0) { setForm((p) => ({ ...p, [field]: val.map(String) })); newAI.add(field); }
    }

    applyStr("developer", s.developer);
    applyInt("totalUnits", s.totalUnits);
    applyInt("totalTowers", s.totalTowers);
    applyInt("floorsPerTower", s.floorsPerTower);
    applyStr("deliveryForecast", s.deliveryForecast);
    applyInt("landAreaM2", s.landAreaM2);
    applyNum("price", s.price);
    applyStr("technicalDescription", s.technicalDescription);
    applyStr("commercialDescription", s.commercialDescription);
    applyArr("unitTypes", s.unitTypes);
    applyArr("condoFeatures", s.condoFeatures);
    applyStr("city", s.city);
    applyStr("neighborhood", s.neighborhood);
    if (s.state != null && s.state !== "") {
      setForm((p) => ({ ...p, state: String(s.state).toUpperCase().slice(0, 2) }));
      newAI.add("state");
    }
    applyNum("minBuyerIncome", s.minBuyerIncome);
    applyNum("buyerIncomeLimit", s.buyerIncomeLimit);
    applyStr("paymentConditions", s.paymentConditions);
    if (s.acceptsFGTS === true) { setForm((p) => ({ ...p, acceptsFGTS: true })); newAI.add("acceptsFGTS"); }
    if (s.acceptsFinancing === true) { setForm((p) => ({ ...p, acceptsFinancing: true })); newAI.add("acceptsFinancing"); }
    if (s.acceptsDirectFinancing === true) { setForm((p) => ({ ...p, acceptsDirectFinancing: true })); newAI.add("acceptsDirectFinancing"); }

    // unitSpecs vindos da IA
    if (Array.isArray(s.unitSpecs) && s.unitSpecs.length > 0) {
      const aiSpecs: UnitSpec[] = s.unitSpecs.map((spec: any, i: number) => ({
        _key: `ai_${i}_${Date.now()}`,
        bedrooms: spec.bedrooms != null ? String(spec.bedrooms) : "",
        suites: spec.suites != null ? String(spec.suites) : "",
        livingRooms: spec.livingRooms != null ? String(spec.livingRooms) : "",
        acPoints: spec.acPoints != null ? String(spec.acPoints) : "",
        areaM2: spec.areaM2 != null ? String(spec.areaM2) : "",
        features: Array.isArray(spec.features) ? spec.features : [],
      }));
      setUnitSpecs(aiSpecs);
      setMinimizedSpecs(new Set(aiSpecs.map((sp) => sp._key)));
      newAI.add("unitSpecs");
    }

    setAiFields(newAI);
    setAiSuggestions(null);
    setSuccess("Sugestões da IA aplicadas. Revise e salve.");
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const commercialDocs = docs.filter((d) => ["BOOK", "MEMORIAL", "TABELA", "OUTROS"].includes(d.type ?? ""));
  const plants = docs.filter((d) => d.type === "PLANTA");
  const typeLabel = "Loteamento";

  if (loading) {
    return (
      <AppShell title={typeLabel}>
        <div className="flex items-center justify-center py-20">
          <span className="text-sm text-[var(--shell-subtext)]">Carregando...</span>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={typeLabel}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setShowSaveModal(true); }}>
        <div className="mx-auto w-full max-w-5xl">

          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-[var(--shell-text)] leading-tight">
                {form.title || `Novo ${typeLabel.toLowerCase()}`}
              </h1>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {typeLabel}
                </span>
                <span className="text-xs text-[var(--shell-subtext)]">ID: {id}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {userRole === "AGENT" && capturedByUserId === userId && publicationStatus === "DRAFT" ? (
                <button type="button" onClick={() => setShowDeleteConfirm(true)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                  Excluir
                </button>
              ) : userRole === "AGENT" && capturedByUserId === userId ? (
                <button type="button" onClick={() => setShowRequestDeleteModal(true)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                  Solicitar exclusão
                </button>
              ) : userRole === "AGENT" ? (
                <span className="rounded-lg border border-[var(--shell-card-border)] px-3 py-2 text-sm font-medium text-gray-300 cursor-not-allowed">
                  Sem permissão
                </span>
              ) : (
                <button type="button" onClick={() => setShowDeleteConfirm(true)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                  Excluir
                </button>
              )}
              <Link href="/products" className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-[var(--shell-bg)]">
                Voltar
              </Link>
            </div>
          </div>

          {/* Alerts */}
          {error && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
              <div className="w-full max-w-sm rounded-2xl bg-[var(--shell-card-bg)] p-6 shadow-xl">
                <h2 className="text-base font-semibold text-red-600 mb-3">Atenção</h2>
                <p className="text-sm text-[var(--shell-text)] mb-5">{error}</p>
                <div className="flex justify-end">
                  <button type="button" onClick={() => setError(null)}
                    className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800">
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}
          {success && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

          {/* AI suggestions modal */}
          {aiSuggestions && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-lg rounded-2xl bg-[var(--shell-card-bg)] p-6 shadow-xl max-h-[80vh] overflow-y-auto">
                <h2 className="text-base font-semibold text-[var(--shell-text)] mb-1">Sugestões da IA</h2>
                <p className="text-sm text-[var(--shell-subtext)] mb-4">Campos extraídos do Book / Memorial. Revise e clique em Aplicar.</p>
                <div className="space-y-2 text-sm">
                  {Object.entries(aiSuggestions).map(([key, val]) =>
                    val != null && val !== "" && !(Array.isArray(val) && val.length === 0) && (
                      <div key={key} className="flex items-start gap-2 rounded-lg border bg-[var(--shell-bg)] px-3 py-2">
                        <span className="font-medium text-[var(--shell-subtext)] w-36 shrink-0 text-xs">{AI_FIELD_LABELS[key] ?? key}</span>
                        <span className="text-[var(--shell-subtext)] text-xs break-words min-w-0">{formatAIValue(val)}</span>
                      </div>
                    )
                  )}
                </div>
                <div className="mt-5 flex justify-end gap-3">
                  <button type="button" onClick={() => setAiSuggestions(null)}
                    className="rounded-lg border px-4 py-2 text-sm hover:bg-[var(--shell-bg)]">Cancelar</button>
                  <button type="button" onClick={applyAISuggestions}
                    className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800">
                    Aplicar sugestões
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal solicitar exclusão (AGENT) */}
          {showRequestDeleteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
              <div className="w-full max-w-sm rounded-2xl bg-[var(--shell-card-bg)] p-6 shadow-xl">
                <h2 className="text-base font-semibold text-[var(--shell-text)] mb-2">Solicitar exclusão?</h2>
                <p className="text-sm text-[var(--shell-subtext)] mb-6">Um MANAGER ou OWNER será notificado para aprovar ou rejeitar a exclusão.</p>
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setShowRequestDeleteModal(false)} disabled={requestingDelete}
                    className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-[var(--shell-bg)] disabled:opacity-50">Cancelar</button>
                  <button type="button" onClick={handleRequestDelete} disabled={requestingDelete}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                    {requestingDelete ? "Enviando..." : "Solicitar"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete confirm */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-sm rounded-2xl bg-[var(--shell-card-bg)] p-6 shadow-xl">
                <h2 className="text-base font-semibold text-[var(--shell-text)] mb-2">Excluir {typeLabel.toLowerCase()}?</h2>
                <p className="text-sm text-[var(--shell-subtext)] mb-6">Esta ação não pode ser desfeita.</p>
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                    className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-[var(--shell-bg)] disabled:opacity-50">Cancelar</button>
                  <button type="button" onClick={handleDelete} disabled={deleting}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                    {deleting ? "Excluindo..." : "Sim, excluir"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Save modal */}
          {showSaveModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-sm rounded-2xl bg-[var(--shell-card-bg)] p-6 shadow-xl">
                <h2 className="text-base font-semibold text-[var(--shell-text)] mb-2">Publicar agora?</h2>
                <p className="text-sm text-[var(--shell-subtext)] mb-6">Escolha se deseja publicar o {typeLabel.toLowerCase()} ou salvar como rascunho.</p>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => doSave("PUBLISHED")} disabled={saving}
                    className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                    Publicar agora
                  </button>
                  <button type="button" onClick={() => doSave("DRAFT")} disabled={saving}
                    className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-[var(--shell-bg)] disabled:opacity-50">
                    Salvar como rascunho
                  </button>
                  <button type="button" onClick={() => setShowSaveModal(false)}
                    className="w-full text-center text-sm text-[var(--shell-subtext)] hover:text-[var(--shell-subtext)] py-1">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {/* Main layout — form + AI panel */}
          <div className="flex gap-5 items-start">

            {/* Form columns */}
            <div className="flex-1 min-w-0 space-y-3">

              {/* ── Captação ──────────────────────────────────────────────── */}
              {capturedBy && (
                <div className="rounded-xl border bg-[var(--shell-card-bg)] px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-subtext)] mb-3">Captação</p>
                  <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                    <div>
                      <span className="text-xs text-[var(--shell-subtext)]">Cadastrado por</span>
                      <p className="font-medium text-[var(--shell-text)]">{capturedBy.apelido || capturedBy.nome}</p>
                    </div>
                    {capturedBy.telefone && (
                      <div>
                        <span className="text-xs text-[var(--shell-subtext)]">Telefone</span>
                        <p className="font-medium text-[var(--shell-text)]">{capturedBy.telefone}</p>
                      </div>
                    )}
                    {capturedBy.email && (
                      <div>
                        <span className="text-xs text-[var(--shell-subtext)]">E-mail</span>
                        <p className="font-medium text-[var(--shell-text)]">{capturedBy.email}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── S1: Identificação ─────────────────────────────────────── */}
              <Section title="1. Identificação" open={open.has("identificacao")} onToggle={() => toggle("identificacao")}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Field label={`Nome do ${typeLabel.toLowerCase()} *`}>
                      <input value={form.title} onChange={(e) => f({ title: e.target.value })}
                        placeholder="Ex.: Loteamento Recanto Verde" className={inp} disabled={loading} required />
                    </Field>
                  </div>
                  <Field label="Estado do imóvel">
                    <select value={form.condition} onChange={(e) => f({ condition: e.target.value as DevCondition })} className={sel} disabled={loading}>
                      <option value="">— selecionar —</option>
                      <option value="NA_PLANTA">Na planta</option>
                      <option value="EM_CONSTRUCAO">Em construção</option>
                      <option value="PRONTO">Pronto</option>
                    </select>
                  </Field>
                  <Field label="Padrão">
                    <select value={form.standard} onChange={(e) => f({ standard: e.target.value as DevStandard })} className={sel} disabled={loading}>
                      <option value="">— selecionar —</option>
                      <option value="ECONOMICO">Econômico / Popular</option>
                      <option value="MEDIO">Médio padrão</option>
                      <option value="ALTO">Alto padrão</option>
                      <option value="LUXO">Luxo</option>
                    </select>
                  </Field>
                </div>

              </Section>

              {/* ── S2: Documentação Comercial ─────────────────────────────── */}
              <Section title="2. Documentação Comercial" open={open.has("documentacao")} onToggle={() => toggle("documentacao")}>

                {/* Documentos — lista unificada */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--shell-subtext)]">Documentos Anexados</p>
                  <p className="mb-3 text-xs text-[var(--shell-subtext)]">Book, Memorial, Tabela e Plantas. Os documentos marcados serão lidos pela IA.</p>

                  {docsLoading && <p className="text-xs text-[var(--shell-subtext)]">Carregando documentos...</p>}
                  {docs.length > 0 && (
                    <ul className="divide-y rounded-lg border bg-[var(--shell-card-bg)] mb-3">
                      {docs.map((doc) => {
                        const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
                        const token = typeof window !== "undefined" ? (localStorage.getItem("accessToken") || "") : "";
                        const downloadUrl = `${API}/products/${id}/documents/${doc.id}/download`;
                        return (
                          <li key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{DOC_TYPE_LABELS[doc.type ?? ""] ?? doc.type}</span>
                              <a href={downloadUrl} target="_blank" rel="noreferrer"
                                onClick={(e) => {
                                  e.preventDefault();
                                  fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } })
                                    .then((r) => r.blob())
                                    .then((blob) => {
                                      const a = document.createElement("a");
                                      a.href = URL.createObjectURL(blob);
                                      a.download = doc.title || `${DOC_TYPE_LABELS[doc.type ?? ""] ?? doc.type}`;
                                      a.click();
                                      URL.revokeObjectURL(a.href);
                                    });
                                }}
                                className="text-slate-700 hover:underline truncate cursor-pointer">
                                {doc.title || DOC_TYPE_LABELS[doc.type ?? ""] || doc.type}
                              </a>
                              {doc.notes && <span className="shrink-0 text-xs text-[var(--shell-subtext)]">{doc.notes} m²</span>}
                            </div>
                            <button type="button" onClick={() => handleDeleteDoc(doc.id)}
                              className="shrink-0 rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">Excluir</button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Upload buttons */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(["BOOK", "MEMORIAL", "TABELA", "OUTROS"] as const).map((t) => (
                      <button key={t} type="button" disabled={docUploading}
                        onClick={() => { docFileRef.current?.setAttribute("data-dtype", t); docFileRef.current?.click(); }}
                        className="rounded-lg border bg-[var(--shell-card-bg)] px-3 py-1.5 text-xs font-medium hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                        {docUploading ? "Enviando..." : `+ ${DOC_TYPE_LABELS[t]}`}
                      </button>
                    ))}
                    <button type="button" disabled={plantUploading}
                      onClick={() => setShowPlantForm((v) => !v)}
                      className="rounded-lg border bg-[var(--shell-card-bg)] px-3 py-1.5 text-xs font-medium hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                      {plantUploading ? "Enviando..." : "+ Planta"}
                    </button>
                    <input ref={docFileRef} type="file" accept=".pdf" className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        const dtype = docFileRef.current?.getAttribute("data-dtype") as "BOOK" | "MEMORIAL" | "TABELA" | "OUTROS" | null;
                        if (file && dtype) handleDocUpload(file, dtype as any);
                      }} />
                  </div>

                  {commercialDocs.length > 0 && !aiLoading && (
                    <button type="button" onClick={handleAIExtract}
                      className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 transition-colors">
                      <span>✦</span>
                      Gerar informações com IA
                    </button>
                  )}
                  {aiLoading && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <svg className="animate-spin h-4 w-4 text-violet-600 shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-violet-700">✦ IA trabalhando...</p>
                          <p className="text-xs text-violet-500 mt-0.5">{aiStatus || "Processando documentos..."}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {aiError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start justify-between gap-3">
                      <p className="text-sm text-red-700">{aiError}</p>
                      <button type="button" onClick={() => setAiError(null)} className="text-red-400 hover:text-red-600 shrink-0 text-xs">×</button>
                    </div>
                  )}
                </div>

                {/* Planta form inline */}
                {showPlantForm && (
                  <div className="rounded-lg border bg-[var(--shell-card-bg)] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-[var(--shell-subtext)]">Nova planta</p>
                      <button type="button" onClick={() => { setShowPlantForm(false); setPlantName(""); setPlantArea(""); }}
                        className="text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-subtext)]">✕ Cancelar</button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Nome da planta *</label>
                        <input value={plantName} onChange={(e) => setPlantName(e.target.value)}
                          placeholder="Ex.: Planta tipo A — 2 quartos" className={inp} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Metragem (m²)</label>
                        <input value={plantArea} onChange={(e) => setPlantArea(e.target.value)}
                          placeholder="Ex.: 65" inputMode="numeric" className={inp} />
                      </div>
                    </div>
                    <button type="button" disabled={!plantName.trim() || plantUploading}
                      onClick={() => plantFileRef.current?.click()}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                      {plantUploading ? "Enviando..." : "Selecionar arquivo"}
                    </button>
                    <input ref={plantFileRef} type="file" accept=".pdf,image/*" className="sr-only"
                      onChange={(e) => { const fi = e.target.files?.[0]; if (fi) handlePlantUpload(fi); }} />
                  </div>
                )}
              </Section>

              {/* ── S3: Informações do Empreendimento ──────────────────────── */}
              <Section title="3. Informações do Loteamento" open={open.has("informacoes")} onToggle={() => toggle("informacoes")}>
                <div className="space-y-4">
                    {/* Construtora */}
                    <Field label="Construtora / Incorporadora" ai={aiFields.has("developer")} onClearAI={() => clearAI("developer")}>
                      <input value={form.developer}
                        onChange={(e) => { f({ developer: e.target.value }); clearAI("developer"); }}
                        placeholder="Ex.: MRV Engenharia" className={inp} />
                    </Field>

                    {/* Localização */}
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="CEP">
                        <input value={form.zipCode} onChange={(e) => f({ zipCode: e.target.value })}
                          onBlur={(e) => fetchCep(e.target.value)} placeholder="00000-000" className={inp} disabled={loading} />
                      </Field>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="mb-1 flex items-center gap-1">
                            <label className="text-xs font-medium text-[var(--shell-subtext)]">Estado (UF)</label>
                            {aiFields.has("state") && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">✦ IA <button type="button" onClick={() => clearAI("state")} className="ml-0.5 text-violet-400 hover:text-violet-700">×</button></span>}
                          </div>
                          <input value={form.state} onChange={(e) => { f({ state: e.target.value.toUpperCase() }); clearAI("state"); }}
                            maxLength={2} placeholder="SP" className={inp} disabled={loading} />
                        </div>
                        <div className="col-span-2">
                          <div className="mb-1 flex items-center gap-1">
                            <label className="text-xs font-medium text-[var(--shell-subtext)]">Cidade</label>
                            {aiFields.has("city") && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">✦ IA <button type="button" onClick={() => clearAI("city")} className="ml-0.5 text-violet-400 hover:text-violet-700">×</button></span>}
                          </div>
                          <input value={form.city} onChange={(e) => { f({ city: e.target.value }); clearAI("city"); }} className={inp} disabled={loading} />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Field label="Rua / Logradouro">
                          <input value={form.street} onChange={(e) => f({ street: e.target.value })} className={inp} disabled={loading} />
                        </Field>
                      </div>
                      <Field label="Número">
                        <input value={form.streetNumber} onChange={(e) => f({ streetNumber: e.target.value })} className={inp} disabled={loading} />
                      </Field>
                      <Field label="Bairro" ai={aiFields.has("neighborhood")} onClearAI={() => clearAI("neighborhood")}>
                        <input value={form.neighborhood} onChange={(e) => { f({ neighborhood: e.target.value }); clearAI("neighborhood"); }} className={inp} disabled={loading} />
                      </Field>
                      <div className="col-span-2">
                        <Field label="Ponto de referência">
                          <input value={form.referencePoint} onChange={(e) => f({ referencePoint: e.target.value })}
                            placeholder="Ex.: Próximo ao Shopping Iguatemi, em frente à Praça da Matriz"
                            className={inp} disabled={loading} />
                        </Field>
                      </div>
                    </div>

                    {/* Dados técnicos */}
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Total de unidades" ai={aiFields.has("totalUnits")} onClearAI={() => clearAI("totalUnits")}>
                        <input value={form.totalUnits} onChange={(e) => { f({ totalUnits: e.target.value }); clearAI("totalUnits"); }}
                          inputMode="numeric" placeholder="Ex.: 240" className={inp} />
                      </Field>
                      <Field label="Torres / Blocos" ai={aiFields.has("totalTowers")} onClearAI={() => clearAI("totalTowers")}>
                        <input value={form.totalTowers} onChange={(e) => { f({ totalTowers: e.target.value }); clearAI("totalTowers"); }}
                          inputMode="numeric" placeholder="Ex.: 3" className={inp} />
                      </Field>
                      <Field label="Andares por torre" ai={aiFields.has("floorsPerTower")} onClearAI={() => clearAI("floorsPerTower")}>
                        <input value={form.floorsPerTower} onChange={(e) => { f({ floorsPerTower: e.target.value }); clearAI("floorsPerTower"); }}
                          inputMode="numeric" placeholder="Ex.: 12" className={inp} />
                      </Field>
                      <Field label="Área do terreno (m²)" ai={aiFields.has("landAreaM2")} onClearAI={() => clearAI("landAreaM2")}>
                        <input value={form.landAreaM2} onChange={(e) => { f({ landAreaM2: e.target.value }); clearAI("landAreaM2"); }}
                          inputMode="numeric" placeholder="Ex.: 5000" className={inp} />
                      </Field>
                      <div className="col-span-2">
                        <Field label="Previsão de entrega" ai={aiFields.has("deliveryForecast")} onClearAI={() => clearAI("deliveryForecast")}>
                          <input value={form.deliveryForecast} onChange={(e) => { f({ deliveryForecast: e.target.value }); clearAI("deliveryForecast"); }}
                            placeholder="Ex.: 06/2027" className={inp} />
                        </Field>
                      </div>
                    </div>

                    {/* Tipo de loteamento */}
                    <div>
                      <label className="mb-2 block text-xs font-medium text-[var(--shell-subtext)]">Tipo de loteamento</label>
                      <div className="flex flex-wrap gap-2">
                        {UNIT_TYPES_LOTEAMENTO.map((t) => (
                          <button key={t} type="button" onClick={() => toggleArr("unitTypes", t)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              form.unitTypes.includes(t)
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] text-[var(--shell-subtext)] hover:border-slate-400"
                            }`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Lazer */}
                    <Field label="Lazer e infraestrutura" ai={aiFields.has("condoFeatures")} onClearAI={() => clearAI("condoFeatures")}>
                      <TagInput
                        value={form.condoFeatures}
                        onChange={(v) => { f({ condoFeatures: v }); clearAI("condoFeatures"); }}
                        suggestions={CONDO_FEATURES}
                        ai={aiFields.has("condoFeatures")}
                        onClearAI={() => clearAI("condoFeatures")}
                      />
                    </Field>

                    {/* Descrições */}
                    <Field label="Descrição técnica" ai={aiFields.has("technicalDescription")} onClearAI={() => clearAI("technicalDescription")}>
                      <textarea value={form.technicalDescription}
                        onChange={(e) => { f({ technicalDescription: e.target.value }); clearAI("technicalDescription"); }}
                        rows={4} placeholder="Descrição técnica do loteamento..."
                        className={`${inp} resize-y`} />
                    </Field>

                    <Field label="Descrição comercial" ai={aiFields.has("commercialDescription")} onClearAI={() => clearAI("commercialDescription")}>
                      <p className="mb-1 text-xs text-[var(--shell-subtext)]">Usada pela IA de vendas e pelo marketing.</p>
                      <textarea value={form.commercialDescription}
                        onChange={(e) => { f({ commercialDescription: e.target.value }); clearAI("commercialDescription"); }}
                        rows={4} placeholder="Descrição com foco comercial, destacando diferenciais..."
                        className={`${inp} resize-y`} />
                    </Field>

                    {/* Locais de visita */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-xs font-medium text-[var(--shell-subtext)]">Locais de visita</label>
                        <button type="button"
                          onClick={() => {
                            const isPrimary = visitLocations.length === 0;
                            setVisitLocations((p) => [...p, {
                              _key: `vl_${Date.now()}`,
                              type: "STAND", address: "", label: "", primary: isPrimary,
                            }]);
                          }}
                          className="rounded-lg border border-dashed border-[var(--shell-card-border)] px-2.5 py-1 text-xs text-[var(--shell-subtext)] hover:border-slate-400 hover:text-[var(--shell-subtext)] transition-colors">
                          + Adicionar local
                        </button>
                      </div>
                      {visitLocations.length === 0 && (
                        <button type="button"
                          onClick={() => setVisitLocations([{ _key: `vl_${Date.now()}`, type: "STAND", address: "", label: "", primary: true }])}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--shell-card-border)] px-4 py-3 text-sm text-[var(--shell-subtext)] hover:border-slate-300 hover:text-[var(--shell-subtext)] transition-colors">
                          + Adicionar local de visita
                        </button>
                      )}
                      <div className="space-y-2">
                        {visitLocations.map((vl, idx) => (
                          <div key={vl._key} className={`rounded-lg border p-3 space-y-2 ${vl.primary ? "border-blue-200 bg-blue-50/40" : "bg-[var(--shell-bg)]"}`}>
                            <div className="flex items-center gap-2">
                              <select value={vl.type}
                                onChange={(e) => setVisitLocations((p) => p.map((x) => x._key === vl._key ? { ...x, type: e.target.value as VisitLocation["type"] } : x))}
                                className={`${sel} flex-1`}>
                                {(["STAND", "ESCRITORIO", "OUTRO"] as const).map((t) => (
                                  <option key={t} value={t}>{VISIT_LOCATION_TYPE_LABELS[t]}</option>
                                ))}
                              </select>
                              <button type="button"
                                onClick={() => {
                                  const newList = visitLocations.map((x) => ({ ...x, primary: x._key === vl._key }));
                                  setVisitLocations(newList);
                                }}
                                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${vl.primary ? "border-blue-600 bg-blue-600 text-white" : "border-[var(--shell-card-border)] text-[var(--shell-subtext)] hover:border-blue-400"}`}
                                title="Definir como prioritário para a IA">
                                {vl.primary ? "★ Prioritário" : "Prioritário"}
                              </button>
                              <button type="button"
                                onClick={() => setVisitLocations((p) => p.filter((x) => x._key !== vl._key))}
                                className="shrink-0 text-xs text-gray-300 hover:text-red-500">✕</button>
                            </div>
                            {vl.type === "OUTRO" && (
                              <input value={vl.label}
                                onChange={(e) => setVisitLocations((p) => p.map((x) => x._key === vl._key ? { ...x, label: e.target.value } : x))}
                                placeholder="Nome do local" className={inp} />
                            )}
                            <input value={vl.address}
                              onChange={(e) => setVisitLocations((p) => p.map((x) => x._key === vl._key ? { ...x, address: e.target.value } : x))}
                              placeholder="Endereço completo, horário de funcionamento..."
                              className={inp} />
                            {vl.primary && <p className="text-[10px] text-blue-600">A IA priorizará este local ao sugerir visitas.</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
              </Section>

              {/* ── S4: Especificações das Unidades ─────────────────────────── */}
              <Section title="4. Especificações das Unidades" open={open.has("especificacoes")} onToggle={() => toggle("especificacoes")}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-subtext)]">Especificações das Unidades</span>
                    {aiFields.has("unitSpecs") && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                        ✦ IA
                        <button type="button" onClick={() => clearAI("unitSpecs")} className="ml-0.5 text-violet-400 hover:text-violet-700 leading-none">×</button>
                      </span>
                    )}
                  </div>
                  <button type="button"
                    onClick={() => {
                      const newSpec = EMPTY_UNIT_SPEC(unitSpecs.length + 1);
                      setUnitSpecs((p) => [...p, newSpec]);
                      setMinimizedSpecs((prev) => {
                        const next = new Set(prev);
                        unitSpecs.forEach((s) => next.add(s._key));
                        return next;
                      });
                    }}
                    className="rounded-lg border border-dashed border-[var(--shell-card-border)] px-3 py-1 text-xs text-[var(--shell-subtext)] hover:border-slate-400 hover:text-[var(--shell-subtext)] transition-colors">
                    + Adicionar unidade
                  </button>
                </div>

                {unitSpecs.length === 0 && (
                  <button type="button"
                    onClick={() => { setUnitSpecs([EMPTY_UNIT_SPEC(1)]); setMinimizedSpecs(new Set()); }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--shell-card-border)] px-4 py-4 text-sm text-[var(--shell-subtext)] hover:border-slate-300 hover:text-[var(--shell-subtext)] transition-colors">
                    + Adicionar especificação de unidade
                  </button>
                )}

                <div className="space-y-2">
                  {unitSpecs.map((spec, idx) => {
                    const isMin = minimizedSpecs.has(spec._key);
                    const isAI = aiFields.has("unitSpecs");
                    const title = unitSpecTitle(spec, idx);

                    return (
                      <div key={spec._key} className={`rounded-lg border overflow-hidden ${isAI ? "border-violet-200 bg-violet-50/30" : "bg-[var(--shell-bg)]"}`}>
                        {/* Header do card */}
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <span className="flex-1 text-sm font-semibold text-[var(--shell-text)] min-w-0 truncate">{title}</span>
                          {isAI && (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                              ✦ IA
                            </span>
                          )}
                          <button type="button"
                            onClick={() => setMinimizedSpecs((prev) => {
                              const next = new Set(prev);
                              next.has(spec._key) ? next.delete(spec._key) : next.add(spec._key);
                              return next;
                            })}
                            className="shrink-0 text-[var(--shell-subtext)] hover:text-[var(--shell-subtext)] text-xs px-1"
                            title={isMin ? "Expandir" : "Minimizar"}>
                            {isMin ? "▼" : "▲"}
                          </button>
                          <button type="button"
                            onClick={() => {
                              setUnitSpecs((p) => p.filter((s) => s._key !== spec._key));
                              setMinimizedSpecs((prev) => { const n = new Set(prev); n.delete(spec._key); return n; });
                            }}
                            className="shrink-0 text-xs text-gray-300 hover:text-red-500">✕</button>
                        </div>

                        {/* Conteúdo expandido */}
                        {!isMin && (
                          <div className="border-t px-3 py-3 space-y-3">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                              <div>
                                <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Quartos</label>
                                <input value={spec.bedrooms} onChange={(e) => patchUnitSpec(spec._key, { bedrooms: e.target.value })}
                                  inputMode="numeric" placeholder="Ex.: 2" className={inp} />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Suítes</label>
                                <input value={spec.suites} onChange={(e) => patchUnitSpec(spec._key, { suites: e.target.value })}
                                  inputMode="numeric" placeholder="Ex.: 1" className={inp} />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Salas</label>
                                <input value={spec.livingRooms} onChange={(e) => patchUnitSpec(spec._key, { livingRooms: e.target.value })}
                                  inputMode="numeric" placeholder="Ex.: 1" className={inp} />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Área privativa (m²)</label>
                                <input value={spec.areaM2 ?? ""} onChange={(e) => patchUnitSpec(spec._key, { areaM2: e.target.value })}
                                  inputMode="decimal" placeholder="Ex.: 58" className={inp} />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Pts. ar-condicionado</label>
                                <input value={spec.acPoints} onChange={(e) => patchUnitSpec(spec._key, { acPoints: e.target.value })}
                                  inputMode="numeric" placeholder="Ex.: 2" className={inp} />
                              </div>
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-medium text-[var(--shell-subtext)]">Características da unidade</label>
                              <TagInput
                                value={spec.features}
                                onChange={(v) => patchUnitSpec(spec._key, { features: v })}
                                suggestions={UNIT_FEATURE_SUGGESTIONS}
                                ai={isAI}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>

              {/* ── S5: Valores e Condições ─────────────────────────── */}
              <Section title="5. Valores e Condições" open={open.has("valores")} onToggle={() => toggle("valores")}>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Preço a partir de" ai={aiFields.has("price")} onClearAI={() => clearAI("price")}>
                    <CurrencyInput value={form.price} onChange={(v) => { f({ price: v }); clearAI("price"); }} />
                  </Field>
                  <div />
                  <Field label="Renda mínima do comprador">
                    <CurrencyInput value={form.minBuyerIncome} onChange={(v) => f({ minBuyerIncome: v })} />
                  </Field>
                  <Field label="Renda máxima do comprador (opcional)">
                    <CurrencyInput value={form.buyerIncomeLimit} onChange={(v) => f({ buyerIncomeLimit: v })} />
                  </Field>
                </div>

                {/* Aceites */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-[var(--shell-subtext)]">Condições aceitas</label>
                  <div className="flex flex-wrap gap-2">
                    <Toggle checked={form.acceptsFGTS} onChange={(v) => f({ acceptsFGTS: v })} label="FGTS" />
                    <Toggle checked={form.acceptsFinancing} onChange={(v) => f({ acceptsFinancing: v })} label="Financiamento Bancário" />
                    <Toggle checked={form.acceptsDirectFinancing} onChange={(v) => f({ acceptsDirectFinancing: v })} label="Financiamento Direto c/ Incorporadora" />
                    <Toggle checked={form.acceptsTradeIn} onChange={(v) => f({ acceptsTradeIn: v })} label="Aceita troca" />
                  </div>
                </div>

                {/* Tipos de troca */}
                {form.acceptsTradeIn && (
                  <div>
                    <label className="mb-2 block text-xs font-medium text-[var(--shell-subtext)]">O que aceita na troca?</label>
                    <div className="flex flex-wrap gap-2">
                      {TRADE_IN_TYPES.map((t) => (
                        <button key={t} type="button" onClick={() => toggleArr("tradeInTypes", t)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            form.tradeInTypes.includes(t)
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] text-[var(--shell-subtext)] hover:border-slate-400"
                          }`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Entrada */}
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Valor de entrada mínima">
                    <CurrencyInput value={form.minEntryValue} onChange={(v) => f({ minEntryValue: v })} />
                  </Field>
                  <div className="flex flex-col justify-end pb-0.5">
                    <Toggle
                      checked={form.acceptsInstallmentEntry}
                      onChange={(v) => f({ acceptsInstallmentEntry: v, installmentEntryMonths: v ? form.installmentEntryMonths : "" })}
                      label="Parcela entrada"
                    />
                  </div>
                </div>

                {form.acceptsInstallmentEntry && (
                  <Field label="Entrada parcelada em até (meses)">
                    <input value={form.installmentEntryMonths}
                      onChange={(e) => f({ installmentEntryMonths: e.target.value })}
                      inputMode="numeric" placeholder="Ex.: 36" className={inp} />
                  </Field>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div />
                  <Field label="Revisar preços em (dias)">
                    <input value={form.priceReviewDays ?? ""}
                      onChange={(e) => f({ priceReviewDays: e.target.value })}
                      inputMode="numeric" placeholder="Ex.: 30"
                      className={inp} />
                    {form.priceReviewDays && (
                      <p className="mt-1 text-xs text-amber-600">
                        Corretor e Gerente receberão uma notificação para atualizar o cadastro em {form.priceReviewDays} dias.
                      </p>
                    )}
                  </Field>
                </div>

                <Field label="Condições de pagamento">
                  <textarea value={form.paymentConditions}
                    onChange={(e) => f({ paymentConditions: e.target.value })}
                    rows={3} placeholder="Descreva condições especiais, formas de pagamento, etc..."
                    className={`${inp} resize-y`} />
                </Field>
              </Section>

              {/* ── S6: Simulador ───────────────────────────────────────────── */}
              <div className="rounded-xl border bg-[var(--shell-card-bg)] overflow-hidden">
                <div className="flex w-full items-center justify-between px-5 py-4">
                  <span className="text-sm font-semibold text-[var(--shell-text)]">6. Simulador</span>
                  <span className="text-xs text-[var(--shell-subtext)] rounded-full border border-[var(--shell-card-border)] px-2 py-0.5">Em breve</span>
                </div>
              </div>

              {/* ── S7: Mídia ───────────────────────────────────────────────── */}
              <div className="rounded-xl border bg-[var(--shell-card-bg)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle("midia")}
                  className="flex w-full items-center justify-between px-5 py-4 hover:bg-[var(--shell-bg)] transition-colors"
                >
                  <span className="text-sm font-semibold text-[var(--shell-text)]">7. Mídia</span>
                  <svg className={`h-4 w-4 text-[var(--shell-subtext)] transition-transform ${open.has("midia") ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                {open.has("midia") && (
                  <div className="border-t px-5 py-4 space-y-4">
                    <p className="text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Fotos</p>

                    {/* Upload form */}
                    <div className="rounded-lg border bg-[var(--shell-bg)] p-3 space-y-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--shell-subtext)]">Nome da imagem</label>
                        <input
                          value={imgTitle}
                          onChange={(e) => setImgTitle(e.target.value)}
                          placeholder="Ex: Fachada, Piscina, Área Gourmet..."
                          className={inp}
                          disabled={imgUploading}
                        />
                      </div>
                      <label className="block">
                        <input type="file" accept="image/*" disabled={imgUploading || loading}
                          onChange={(e) => onUploadImage(e.target.files?.[0] ?? null)}
                          className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:bg-[var(--shell-card-bg)] file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-[var(--shell-bg)]" />
                      </label>
                      {imgUploading && <p className="text-xs text-[var(--shell-subtext)]">Enviando...</p>}
                    </div>

                    {productImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {productImages.map((img: any) => {
                          const url = normalizeImageUrl(img);
                          const isPublic = img.publishSite !== false;
                          const isCover = img.isPrimary === true;
                          const displayName = img.customLabel || img.title || "";
                          return (
                            <div key={img.id ?? url} className={`relative overflow-hidden rounded-lg border bg-[var(--shell-bg)] ${isCover ? "ring-2 ring-amber-400" : ""}`}>
                              <a href={url ?? undefined} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url ?? undefined} alt={displayName} className={`h-24 w-full object-cover transition-opacity ${isPublic ? "" : "opacity-40"}`} />
                              </a>
                              {displayName && (
                                <div className="absolute bottom-0 left-0 right-0 bg-black/55 px-1.5 py-0.5">
                                  <p className="text-[10px] text-white truncate">{displayName}</p>
                                </div>
                              )}
                              {isCover && (
                                <div className="absolute top-1 left-1 rounded-full bg-amber-400 px-1.5 py-0.5">
                                  <p className="text-[9px] font-bold text-white leading-none">CAPA</p>
                                </div>
                              )}
                              {!isCover && (
                                <button type="button" onClick={() => onSetPrimaryImage(img.id)}
                                  title="Definir como capa do produto"
                                  className="absolute top-1 left-1 rounded-full bg-[var(--shell-card-bg)]/90 p-1 shadow hover:bg-amber-50 transition-colors">
                                  <svg className="h-3.5 w-3.5 text-[var(--shell-subtext)]" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                </button>
                              )}
                              {/* Download */}
                              {url && (
                                <button type="button" onClick={() => downloadImage(url, displayName || `imagem-${img.id}`)}
                                  title="Baixar imagem"
                                  className="absolute top-1 right-11 rounded-full bg-[var(--shell-card-bg)]/90 p-1 shadow hover:bg-blue-50 transition-colors">
                                  <svg className="h-3.5 w-3.5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              )}
                              <button type="button" onClick={() => handleToggleImagePublic(img.id, isPublic)}
                                title={isPublic ? "Pública (divulgada) — clique para uso interno" : "Interna — clique para divulgar"}
                                className="absolute top-1 right-6 rounded-full bg-[var(--shell-card-bg)]/90 p-1 shadow hover:bg-[var(--shell-card-bg)] transition-colors">
                                {isPublic ? (
                                  <svg className="h-3.5 w-3.5 text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M10 3C5 3 1.73 7.11 1.05 8.45a1 1 0 000 1.1C1.73 10.89 5 15 10 15s8.27-4.11 8.95-5.45a1 1 0 000-1.1C18.27 7.11 15 3 10 3zm0 10a4 4 0 110-8 4 4 0 010 8zm0-6a2 2 0 100 4 2 2 0 000-4z" />
                                  </svg>
                                ) : (
                                  <svg className="h-3.5 w-3.5 text-[var(--shell-subtext)]" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074L3.707 2.293zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                                  </svg>
                                )}
                              </button>
                              <button type="button" onClick={() => onDeleteImage(img.id)}
                                title="Excluir imagem"
                                className="absolute top-1 right-1 rounded-full bg-[var(--shell-card-bg)]/90 p-1 shadow hover:bg-red-50 transition-colors">
                                <svg className="h-3.5 w-3.5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* ── Painel Leitura da IA ─────────────────────────────────────── */}
            {(aiLastExtracted || docs.length > 0) && (
              <div className="w-72 shrink-0">
                <div className="sticky top-4 space-y-3">

                  {/* Leitura da IA */}
                  {aiLastExtracted && (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-violet-200">
                        <span className="text-xs font-semibold text-violet-700">✦ Leitura da IA</span>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setAiPanelMinimized((v) => !v)}
                            className="text-xs text-violet-400 hover:text-violet-700 px-1.5 py-0.5 rounded hover:bg-violet-100"
                            title={aiPanelMinimized ? "Expandir" : "Minimizar"}>
                            {aiPanelMinimized ? "▼" : "▲"}
                          </button>
                        </div>
                      </div>
                      {!aiPanelMinimized && (
                        <div className="px-4 py-3 space-y-2 max-h-[50vh] overflow-y-auto">
                          {Object.entries(aiLastExtracted).map(([key, val]) =>
                            val != null && val !== "" && !(Array.isArray(val) && val.length === 0) && (
                              <div key={key}>
                                <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide">{AI_FIELD_LABELS[key] ?? key}</p>
                                <p className="text-xs text-violet-900 mt-0.5 break-words">{formatAIValue(val)}</p>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Downloads */}
                  {docs.length > 0 && (
                    <div className="rounded-xl border bg-[var(--shell-card-bg)] overflow-hidden">
                      <div className="px-4 py-3 border-b">
                        <span className="text-xs font-semibold text-[var(--shell-subtext)]">Documentos anexados</span>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        {docs.map((doc) => {
                          const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
                          const token = typeof window !== "undefined" ? (localStorage.getItem("accessToken") || "") : "";
                          const downloadUrl = `${API}/products/${id}/documents/${doc.id}/download`;
                          return (
                            <button key={doc.id} type="button"
                              onClick={() => {
                                fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } })
                                  .then((r) => r.blob())
                                  .then((blob) => {
                                    const a = document.createElement("a");
                                    a.href = URL.createObjectURL(blob);
                                    a.download = doc.title || `${DOC_TYPE_LABELS[doc.type ?? ""] ?? doc.type}`;
                                    a.click();
                                    URL.revokeObjectURL(a.href);
                                  });
                              }}
                              className="flex items-center gap-2 text-xs text-slate-700 hover:text-slate-900 w-full text-left">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-[var(--shell-subtext)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="truncate">{DOC_TYPE_LABELS[doc.type ?? ""] ?? doc.type}{doc.title ? ` — ${doc.title}` : ""}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

          </div>

          {/* Bottom save bar */}
          <div className="mt-6 flex items-center justify-end gap-3 rounded-xl border bg-[var(--shell-card-bg)] px-5 py-4">
            <button type="submit" disabled={saving || loading}
              className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>

        </div>
      </form>
    </AppShell>
  );
}
