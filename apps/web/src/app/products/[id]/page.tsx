"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

// ─── Types ───────────────────────────────────────────────────────────────────

type ProductType =
  | "EMPREENDIMENTO" | "LOTEAMENTO" | "APARTAMENTO" | "CASA" | "KITNET"
  | "SOBRADO" | "TERRENO" | "SALA_COMERCIAL" | "LOJA" | "SALAO_COMERCIAL"
  | "BARRACAO" | "OUTRO";

type DocType = "BOOK" | "MEMORIAL" | "TABELA";
type DocVisibility = "INTERNAL" | "SHAREABLE";

type RoomImage = { id: string; url: string; publicId?: string | null; order: number };
type Room = {
  id: string; type: string; label: string;
  sizeM2?: string | null; notes?: string | null;
  order: number; images: RoomImage[];
};

type OwnerDoc = { id: string; type: string; label?: string | null; url: string; publicId?: string | null };
type OwnerProfile = {
  id: string; name: string; cpf?: string | null; rg?: string | null;
  email?: string | null; phone?: string | null; maritalStatus?: string | null;
  spouseName?: string | null; spouseCpf?: string | null; spouseEmail?: string | null;
  zipCode?: string | null; street?: string | null; streetNumber?: string | null;
  complement?: string | null; neighborhood?: string | null; city?: string | null; state?: string | null;
  documents: OwnerDoc[];
};

type FormData = {
  title: string; origin: string; type: ProductType; status: string;
  standard: string; referenceCode: string; dealType: string; condition: string;
  zipCode: string; street: string; streetNumber: string; complement: string;
  neighborhood: string; city: string; state: string;
  condominiumName: string; hideAddress: boolean;
  price: string; rentPrice: string; iptu: string; condominiumFee: string;
  acceptsFinancing: boolean; acceptsExchange: boolean;
  bedrooms: string; suites: string; bathrooms: string; parkingSpaces: string;
  areaM2: string; builtAreaM2: string; privateAreaM2: string; landAreaM2: string;
  floor: string; totalFloors: string; yearBuilt: string;
  sunPosition: string; furnished: string;
  internalFeatures: string[]; condoFeatures: string[];
  registrationNumber: string; propertySituation: string;
  hasExclusivity: boolean; exclusivityUntil: string; virtualTourUrl: string;
  description: string; tags: string;
};

const EMPTY_FORM: FormData = {
  title: "", origin: "THIRD_PARTY", type: "CASA", status: "ACTIVE",
  standard: "", referenceCode: "", dealType: "SALE", condition: "",
  zipCode: "", street: "", streetNumber: "", complement: "",
  neighborhood: "", city: "", state: "", condominiumName: "", hideAddress: false,
  price: "", rentPrice: "", iptu: "", condominiumFee: "",
  acceptsFinancing: false, acceptsExchange: false,
  bedrooms: "", suites: "", bathrooms: "", parkingSpaces: "",
  areaM2: "", builtAreaM2: "", privateAreaM2: "", landAreaM2: "",
  floor: "", totalFloors: "", yearBuilt: "", sunPosition: "", furnished: "",
  internalFeatures: [], condoFeatures: [],
  registrationNumber: "", propertySituation: "",
  hasExclusivity: false, exclusivityUntil: "", virtualTourUrl: "",
  description: "", tags: "",
};

// ─── Constants ───────────────────────────────────────────────────────────────

const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: "EMPREENDIMENTO", label: "Empreendimento" },
  { value: "LOTEAMENTO", label: "Loteamento" },
  { value: "APARTAMENTO", label: "Apartamento" },
  { value: "CASA", label: "Casa" },
  { value: "KITNET", label: "Kitnet" },
  { value: "SOBRADO", label: "Sobrado" },
  { value: "TERRENO", label: "Terreno" },
  { value: "SALA_COMERCIAL", label: "Sala comercial" },
  { value: "LOJA", label: "Loja" },
  { value: "SALAO_COMERCIAL", label: "Salão comercial" },
  { value: "BARRACAO", label: "Barracão / Galpão" },
  { value: "OUTRO", label: "Outro" },
];

const INTERNAL_FEATURES = [
  "Sala 2 ambientes", "Cozinha americana", "Despensa",
  "Ar condicionado", "Aquecimento solar", "Aquecimento a gás",
  "Piso porcelanato", "Piso madeira",
];

const CONDO_FEATURES = [
  "Piscina", "Academia", "Salão de festas", "Playground",
  "Portaria 24h", "Elevador", "Churrasqueira", "Quadra esportiva",
  "Pet friendly", "Gerador",
];

const SUN_POSITIONS = ["Frente", "Fundos", "Lateral", "Frente e fundos"];

const ROOM_TYPE_CONFIG: {
  value: string; label: string; suggestions: string[]; freeLabel?: boolean;
}[] = [
  { value: "QUARTO",           label: "Quarto",          suggestions: ["Quarto Casal", "Quarto Solteiro ou Visita", "Quarto Empregados"] },
  { value: "SUITE",            label: "Suíte",           suggestions: ["Suíte Master", "Suíte Casal", "Suíte Solteiro"] },
  { value: "BANHEIRO",         label: "Banheiro",        suggestions: ["Banheiro Social", "Lavabo", "Banheiro Serviço"] },
  { value: "LAVABO",           label: "Lavabo",          suggestions: ["Lavabo"] },
  { value: "CLOSET",           label: "Closet",          suggestions: ["Closet Master", "Closet"] },
  { value: "VARANDA",          label: "Varanda",         suggestions: ["Varanda", "Sacada", "Varanda Gourmet"] },
  { value: "ESCRITORIO",       label: "Escritório",      suggestions: ["Escritório"] },
  { value: "AREA_SERVICO",     label: "Área de Serviço", suggestions: ["Área de Serviço"] },
  { value: "VAGA_GARAGEM",     label: "Vaga Garagem",    suggestions: [], freeLabel: true },
  { value: "SALA_ESTAR",       label: "Sala de Estar",   suggestions: ["Sala de Estar"] },
  { value: "SALA_JANTAR",      label: "Sala de Jantar",  suggestions: ["Sala de Jantar"] },
  { value: "COZINHA",          label: "Cozinha",         suggestions: ["Cozinha"] },
  { value: "AREA_GOURMET",     label: "Área Gourmet",    suggestions: ["Área Gourmet"] },
  { value: "QUINTAL",          label: "Quintal",         suggestions: ["Quintal"] },
  { value: "PISCINA_PRIVATIVA",label: "Piscina",         suggestions: ["Piscina Privativa"] },
  { value: "LAVANDERIA",       label: "Lavanderia",      suggestions: ["Lavanderia"] },
  { value: "DEPOSITO",         label: "Depósito",        suggestions: ["Depósito"] },
];

const MARITAL_LABELS: Record<string, string> = {
  SOLTEIRO: "Solteiro(a)", CASADO: "Casado(a)", DIVORCIADO: "Divorciado(a)",
  VIUVO: "Viúvo(a)", UNIAO_ESTAVEL: "União estável",
};

const OWNER_DOC_TYPES = [
  { value: "RG_CPF",                   label: "RG / CPF" },
  { value: "COMPROVANTE_ENDERECO",      label: "Comp. Endereço" },
  { value: "COMPROVANTE_ESTADO_CIVIL",  label: "Comp. Estado Civil" },
  { value: "OUTRO",                     label: "Outro" },
];

// ─── API helpers ──────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? (localStorage.getItem("accessToken") || "") : "";
  return { Authorization: `Bearer ${token}` };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(s: string): number | undefined {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() === "" || !Number.isFinite(n) ? undefined : n;
}

function parseCurrencyInput(s: string): number {
  const t = s.trim();
  if (!t) return NaN;
  const commaIdx = t.lastIndexOf(",");
  const dotIdx = t.lastIndexOf(".");
  if (commaIdx > dotIdx) {
    return parseFloat(t.replace(/\./g, "").replace(",", "."));
  }
  if (dotIdx > commaIdx) {
    const afterDot = t.slice(dotIdx + 1);
    if (afterDot.length === 2) return parseFloat(t.replace(/,/g, ""));
    return parseFloat(t.replace(/\./g, ""));
  }
  return parseFloat(t);
}

function fmtBRL(raw: string): string {
  const n = parseCurrencyInput(raw);
  if (!raw.trim() || isNaN(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso?: string) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
}

function filenameFromCD(cd: string | null): string | null {
  if (!cd) return null;
  const m = cd.match(/filename="([^"]+)"/i) || cd.match(/filename=([^;]+)/i);
  return m?.[1]?.trim().replace(/^"|"$/g, "") ?? null;
}

function guessCategoryFromOrigin(origin: string) {
  return origin === "DEVELOPMENT" ? "ENTERPRISE" : "PROPERTY";
}

// ─── Section accordion ───────────────────────────────────────────────────────

function Section({
  id, title, open, onToggle, children,
}: {
  id: string; title: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t px-5 py-5 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-slate-900" : "bg-gray-200"}`}
      >
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

const inp = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-400";
const sel = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-400 bg-white";

// ─── CurrencyInput ────────────────────────────────────────────────────────────

function CurrencyInput({
  value, onChange, disabled, placeholder = "0,00",
}: {
  value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string;
}) {
  return (
    <div className="flex w-full items-center rounded-lg border focus-within:border-slate-400 overflow-hidden">
      <span className="pl-3 text-sm text-gray-400 select-none shrink-0">R$</span>
      <input
        key={value}
        defaultValue={fmtBRL(value)}
        onBlur={(e) => {
          const n = parseCurrencyInput(e.target.value);
          const normalized = isNaN(n) ? "" : String(n);
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

// ─── RoomCard ─────────────────────────────────────────────────────────────────

function RoomCard({
  room,
  onDelete, onUpdate, onAddImage, onDeleteImage,
}: {
  room: Room;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: { label?: string; sizeM2?: string | null; notes?: string | null }) => void;
  onAddImage: (roomId: string, file: File) => Promise<void>;
  onDeleteImage: (roomId: string, imageId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [label, setLabel] = useState(room.label);
  const [sizeM2, setSizeM2] = useState(room.sizeM2 || "");
  const [notes, setNotes] = useState(room.notes || "");
  const [uploading, setUploading] = useState(false);
  const [deletingImg, setDeletingImg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabel(room.label);
    setSizeM2(room.sizeM2 || "");
    setNotes(room.notes || "");
  }, [room.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function schedule(data: { label?: string; sizeM2?: string | null; notes?: string | null }) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onUpdate(room.id, data), 800);
  }

  const typeConfig = ROOM_TYPE_CONFIG.find((r) => r.value === room.type);
  const typeLabel = typeConfig?.label ?? room.type;

  async function handleImageUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    try { await onAddImage(room.id, file); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function handleImageDelete(imageId: string) {
    if (!confirm("Excluir esta foto?")) return;
    setDeletingImg(imageId);
    try { await onDeleteImage(room.id, imageId); }
    finally { setDeletingImg(null); }
  }

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      {/* ── Header (always visible) ── */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 shrink-0">
          {typeLabel}
        </span>

        {/* Label (editable inline) */}
        <input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            schedule({ label: e.target.value, sizeM2: sizeM2 || null, notes: notes || null });
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-0.5 text-sm font-medium bg-transparent hover:border-gray-200 focus:border-slate-300 outline-none"
          placeholder="Nome do cômodo"
        />

        {/* Size (compact, inline) */}
        <input
          value={sizeM2}
          onChange={(e) => {
            setSizeM2(e.target.value);
            schedule({ label, sizeM2: e.target.value || null, notes: notes || null });
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder="m²"
          className="w-16 shrink-0 rounded border border-transparent px-1.5 py-0.5 text-xs text-gray-500 bg-transparent hover:border-gray-200 focus:border-slate-300 outline-none text-right"
        />

        {/* Photo count badge */}
        {room.images.length > 0 && (
          <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
            {room.images.length} foto{room.images.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 transition-colors"
          title={expanded ? "Recolher" : "Expandir"}
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 20 20" fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(room.id); }}
          className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
          title="Excluir cômodo"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-3 bg-gray-50/50">
          <Field label="Observações">
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                schedule({ label, sizeM2: sizeM2 || null, notes: e.target.value || null });
              }}
              rows={2}
              placeholder="Detalhes do cômodo..."
              className={`${inp} resize-none`}
            />
          </Field>

          {/* Photos */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Fotos</p>
            <div className="flex flex-wrap gap-2">
              {room.images.map((img) => (
                <div key={img.id} className="relative group h-20 w-20 rounded-lg overflow-hidden border bg-gray-50 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleImageDelete(img.id)}
                    disabled={deletingImg === img.id}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
              <label className="h-20 w-20 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 hover:border-slate-300 cursor-pointer shrink-0 transition-colors">
                {uploading ? (
                  <span className="text-xs text-gray-400">...</span>
                ) : (
                  <>
                    <svg className="h-5 w-5 text-gray-300 mb-0.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    <span className="text-xs text-gray-400">Foto</span>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => handleImageUpload(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OwnerCard ────────────────────────────────────────────────────────────────

function OwnerCard({
  owner, onUnlink, onAddDocument, onDeleteDocument,
}: {
  owner: OwnerProfile;
  onUnlink: (id: string) => void;
  onAddDocument: (ownerId: string, file: File, type: string) => Promise<void>;
  onDeleteDocument: (ownerId: string, docId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingTypeRef = useRef("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = pendingTypeRef.current;
    setUploadingType(type);
    try { await onAddDocument(owner.id, file, type); }
    finally { setUploadingType(null); if (fileRef.current) fileRef.current.value = ""; }
  }

  function triggerUpload(type: string) {
    pendingTypeRef.current = type;
    fileRef.current?.click();
  }

  const showSpouse = owner.maritalStatus === "CASADO" || owner.maritalStatus === "UNIAO_ESTAVEL";

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      {/* Compact header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">{owner.name}</span>
        {owner.cpf && <span className="text-xs text-gray-400 shrink-0">{owner.cpf}</span>}
        {owner.phone && <span className="text-xs text-gray-400 shrink-0">{owner.phone}</span>}
        {owner.documents.length > 0 && (
          <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
            {owner.documents.length} doc{owner.documents.length !== 1 ? "s" : ""}
          </span>
        )}
        <button type="button" onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 transition-colors">
          <svg className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
        <button type="button" onClick={() => onUnlink(owner.id)}
          className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors" title="Desvincular">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-4 bg-gray-50/50">
          {/* Dados pessoais */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Dados pessoais</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {owner.rg && <><dt className="text-gray-500">RG</dt><dd className="text-gray-800">{owner.rg}</dd></>}
              {owner.email && <><dt className="text-gray-500">E-mail</dt><dd className="text-gray-800 truncate">{owner.email}</dd></>}
              {owner.maritalStatus && <><dt className="text-gray-500">Estado civil</dt><dd className="text-gray-800">{MARITAL_LABELS[owner.maritalStatus] ?? owner.maritalStatus}</dd></>}
            </dl>
          </div>

          {showSpouse && (owner.spouseName || owner.spouseCpf) && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cônjuge</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {owner.spouseName && <><dt className="text-gray-500">Nome</dt><dd className="text-gray-800">{owner.spouseName}</dd></>}
                {owner.spouseCpf && <><dt className="text-gray-500">CPF</dt><dd className="text-gray-800">{owner.spouseCpf}</dd></>}
                {owner.spouseEmail && <><dt className="text-gray-500">E-mail</dt><dd className="text-gray-800 truncate">{owner.spouseEmail}</dd></>}
              </dl>
            </div>
          )}

          {(owner.city || owner.street) && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Endereço</p>
              <p className="text-sm text-gray-700">
                {[owner.street, owner.streetNumber, owner.complement].filter(Boolean).join(", ")}
                {owner.neighborhood && ` — ${owner.neighborhood}`}
                {owner.city && `, ${owner.city}`}
                {owner.state && ` / ${owner.state}`}
                {owner.zipCode && ` — CEP ${owner.zipCode}`}
              </p>
            </div>
          )}

          {/* Documentos */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Documentos</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {OWNER_DOC_TYPES.map((dt) => (
                <button key={dt.value} type="button" onClick={() => triggerUpload(dt.value)}
                  disabled={uploadingType !== null}
                  className="rounded-lg border bg-white px-2.5 py-1.5 text-xs hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                  {uploadingType === dt.value ? "Enviando..." : `+ ${dt.label}`}
                </button>
              ))}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,image/*" className="sr-only" onChange={handleFile} />

            {owner.documents.length > 0 && (
              <ul className="divide-y rounded-lg border bg-white">
                {owner.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <a href={doc.url} target="_blank" rel="noreferrer"
                      className="text-slate-700 hover:underline truncate min-w-0">
                      {OWNER_DOC_TYPES.find((d) => d.value === doc.type)?.label ?? doc.type}
                      {doc.label ? ` — ${doc.label}` : ""}
                    </a>
                    <button type="button" onClick={() => onDeleteDocument(owner.id, doc.id)}
                      className="shrink-0 rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">
                      Excluir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── NewOwnerForm ─────────────────────────────────────────────────────────────

const EMPTY_OWNER = {
  name: "", cpf: "", rg: "", email: "", phone: "", maritalStatus: "",
  spouseName: "", spouseCpf: "", spouseEmail: "",
  zipCode: "", street: "", streetNumber: "", complement: "",
  neighborhood: "", city: "", state: "",
};

function NewOwnerForm({
  onCreated, onCancel,
}: {
  onCreated: (owner: OwnerProfile) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(EMPTY_OWNER);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fo = (patch: Partial<typeof EMPTY_OWNER>) => setForm((p) => ({ ...p, ...patch }));

  const showSpouse = form.maritalStatus === "CASADO" || form.maritalStatus === "UNIAO_ESTAVEL";

  async function fetchCepOwner(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) return;
      fo({ street: data.logradouro || "", neighborhood: data.bairro || "", city: data.localidade || "", state: data.uf || "" });
    } catch { /* silent */ }
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setErr("Nome é obrigatório"); return; }
    setSaving(true); setErr(null);
    try {
      const token = typeof window !== "undefined" ? (localStorage.getItem("accessToken") || "") : "";
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
      const res = await fetch(`${apiUrl}/owners`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          cpf: form.cpf.trim() || undefined,
          rg: form.rg.trim() || undefined,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          maritalStatus: form.maritalStatus || undefined,
          spouseName: showSpouse ? form.spouseName.trim() || undefined : undefined,
          spouseCpf: showSpouse ? form.spouseCpf.trim() || undefined : undefined,
          spouseEmail: showSpouse ? form.spouseEmail.trim() || undefined : undefined,
          zipCode: form.zipCode.trim() || undefined,
          street: form.street.trim() || undefined,
          streetNumber: form.streetNumber.trim() || undefined,
          complement: form.complement.trim() || undefined,
          neighborhood: form.neighborhood.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onCreated(data.owner);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao criar proprietário");
    } finally { setSaving(false); }
  }

  const inp2 = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-400";
  const sel2 = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-400 bg-white";

  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 space-y-4">
      <p className="text-sm font-semibold text-gray-700">Novo proprietário</p>

      {err && <p className="text-xs text-red-600 rounded bg-red-50 border border-red-200 px-3 py-2">{err}</p>}

      {/* Dados pessoais */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Nome completo *</label>
          <input value={form.name} onChange={(e) => fo({ name: e.target.value })} className={inp2} placeholder="Nome completo" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">CPF</label>
          <input value={form.cpf} onChange={(e) => fo({ cpf: e.target.value })} className={inp2} placeholder="000.000.000-00" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">RG</label>
          <input value={form.rg} onChange={(e) => fo({ rg: e.target.value })} className={inp2} placeholder="00.000.000-0" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">E-mail</label>
          <input type="email" value={form.email} onChange={(e) => fo({ email: e.target.value })} className={inp2} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Telefone / WhatsApp</label>
          <input value={form.phone} onChange={(e) => fo({ phone: e.target.value })} className={inp2} placeholder="(11) 90000-0000" />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Estado civil</label>
          <select value={form.maritalStatus} onChange={(e) => fo({ maritalStatus: e.target.value })} className={sel2}>
            <option value="">-</option>
            {Object.entries(MARITAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Cônjuge */}
      {showSpouse && (
        <div className="rounded-lg border bg-white p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cônjuge</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600">Nome do cônjuge</label>
              <input value={form.spouseName} onChange={(e) => fo({ spouseName: e.target.value })} className={inp2} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">CPF do cônjuge</label>
              <input value={form.spouseCpf} onChange={(e) => fo({ spouseCpf: e.target.value })} className={inp2} placeholder="000.000.000-00" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">E-mail do cônjuge</label>
              <input type="email" value={form.spouseEmail} onChange={(e) => fo({ spouseEmail: e.target.value })} className={inp2} />
            </div>
          </div>
        </div>
      )}

      {/* Endereço */}
      <div className="rounded-lg border bg-white p-3 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Endereço</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">CEP</label>
            <input value={form.zipCode} onChange={(e) => fo({ zipCode: e.target.value })}
              onBlur={(e) => fetchCepOwner(e.target.value)} className={inp2} placeholder="00000-000" />
          </div>
          <div />
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Rua</label>
            <input value={form.street} onChange={(e) => fo({ street: e.target.value })} className={inp2} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Número</label>
            <input value={form.streetNumber} onChange={(e) => fo({ streetNumber: e.target.value })} className={inp2} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Complemento</label>
            <input value={form.complement} onChange={(e) => fo({ complement: e.target.value })} className={inp2} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Bairro</label>
            <input value={form.neighborhood} onChange={(e) => fo({ neighborhood: e.target.value })} className={inp2} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Cidade</label>
            <input value={form.city} onChange={(e) => fo({ city: e.target.value })} className={inp2} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Estado (UF)</label>
            <input value={form.state} onChange={(e) => fo({ state: e.target.value })} maxLength={2} className={inp2} placeholder="SP" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={handleSubmit} disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {saving ? "Salvando..." : "Criar proprietário"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-white">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductEditPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Copy from similar
  const [copyProducts, setCopyProducts] = useState<any[]>([]);
  const [copyLoadedType, setCopyLoadedType] = useState<string | null>(null);

  // Accordion
  const [open, setOpen] = useState<Set<string>>(new Set(["identificacao"]));
  function toggle(s: string) {
    setOpen((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }

  const f = (patch: Partial<FormData>) => setForm((p) => ({ ...p, ...patch }));

  function toggleFeature(field: "internalFeatures" | "condoFeatures", value: string) {
    setForm((p) => {
      const arr = p[field];
      return { ...p, [field]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] };
    });
  }

  // Docs state
  const [docs, setDocs] = useState<ProductDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docType, setDocType] = useState<DocType>("BOOK");
  const [docTitle, setDocTitle] = useState("");
  const [docNotes, setDocNotes] = useState("");
  const [docVisibility, setDocVisibility] = useState<DocVisibility>("INTERNAL");
  const [docUploading, setDocUploading] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  // Rooms state
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);

  // Owners state
  const [productOwners, setProductOwners] = useState<OwnerProfile[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [allOwners, setAllOwners] = useState<OwnerProfile[]>([]);
  const [allOwnersLoaded, setAllOwnersLoaded] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [showNewOwner, setShowNewOwner] = useState(false);

  // Add room panel state
  const [addStep, setAddStep] = useState<"closed" | "type" | "label">("closed");
  const [addType, setAddType] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);

  // IPTU monthly (computed)
  const iptuMonthly = useMemo(() => {
    const n = parseNum(form.iptu);
    if (!n) return null;
    return (n / 12).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [form.iptu]);

  // Auto-title for non-EMPREENDIMENTO types
  const isEmpreendimento = form.type === "EMPREENDIMENTO";

  const computedTitle = useMemo(() => {
    if (isEmpreendimento) return form.title;
    const typeLabel = PRODUCT_TYPES.find((t) => t.value === form.type)?.label ?? form.type;
    const bedroomsPart = form.bedrooms ? ` ${form.bedrooms} quartos` : "";
    const neighborhoodPart = form.neighborhood ? ` - ${form.neighborhood}` : "";
    return `${typeLabel}${bedroomsPart}${neighborhoodPart}`;
  }, [isEmpreendimento, form.type, form.title, form.bedrooms, form.neighborhood]);

  // ── ViaCEP ──────────────────────────────────────────────────────────────────
  async function fetchCep(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) return;
      f({
        street: data.logradouro || "",
        neighborhood: data.bairro || "",
        city: data.localidade || "",
        state: data.uf || "",
      });
    } catch { /* silent */ }
  }

  // ── Load ────────────────────────────────────────────────────────────────────
  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const p = await getProduct(id);
      setProduct(p);
      const pa = p as any;
      setForm({
        title: pa.title ?? "",
        origin: pa.origin ?? "THIRD_PARTY",
        type: pa.type ?? "CASA",
        status: pa.status ?? "ACTIVE",
        standard: pa.standard ?? "",
        referenceCode: pa.referenceCode ?? "",
        dealType: pa.dealType ?? "SALE",
        condition: pa.condition ?? "",
        zipCode: pa.zipCode ?? "",
        street: pa.street ?? "",
        streetNumber: pa.streetNumber ?? "",
        complement: pa.complement ?? "",
        neighborhood: pa.neighborhood ?? "",
        city: pa.city ?? "",
        state: pa.state ?? "",
        condominiumName: pa.condominiumName ?? "",
        hideAddress: pa.hideAddress ?? false,
        price: pa.price != null ? String(pa.price) : "",
        rentPrice: pa.rentPrice != null ? String(pa.rentPrice) : "",
        iptu: pa.iptu != null ? String(pa.iptu) : "",
        condominiumFee: pa.condominiumFee != null ? String(pa.condominiumFee) : "",
        acceptsFinancing: pa.acceptsFinancing ?? false,
        acceptsExchange: pa.acceptsExchange ?? false,
        bedrooms: pa.bedrooms != null ? String(pa.bedrooms) : "",
        suites: pa.suites != null ? String(pa.suites) : "",
        bathrooms: pa.bathrooms != null ? String(pa.bathrooms) : "",
        parkingSpaces: pa.parkingSpaces != null ? String(pa.parkingSpaces) : "",
        areaM2: pa.areaM2 != null ? String(pa.areaM2) : "",
        builtAreaM2: pa.builtAreaM2 != null ? String(pa.builtAreaM2) : "",
        privateAreaM2: pa.privateAreaM2 != null ? String(pa.privateAreaM2) : "",
        landAreaM2: pa.landAreaM2 != null ? String(pa.landAreaM2) : "",
        floor: pa.floor != null ? String(pa.floor) : "",
        totalFloors: pa.totalFloors != null ? String(pa.totalFloors) : "",
        yearBuilt: pa.yearBuilt != null ? String(pa.yearBuilt) : "",
        sunPosition: pa.sunPosition ?? "",
        furnished: pa.furnished ?? "",
        internalFeatures: Array.isArray(pa.internalFeatures) ? pa.internalFeatures : [],
        condoFeatures: Array.isArray(pa.condoFeatures) ? pa.condoFeatures : [],
        registrationNumber: pa.registrationNumber ?? "",
        propertySituation: pa.propertySituation ?? "",
        hasExclusivity: pa.hasExclusivity ?? false,
        exclusivityUntil: pa.exclusivityUntil ? pa.exclusivityUntil.split("T")[0] : "",
        virtualTourUrl: pa.virtualTourUrl ?? "",
        description: pa.description ?? "",
        tags: pa.tags ?? "",
      });
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar produto");
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

  async function loadRooms() {
    if (!id) return;
    setRoomsLoading(true);
    try {
      const res = await fetch(`${API_URL}/products/${id}/rooms`, { headers: authHeaders() });
      const data = await res.json();
      setRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } catch { /* silent */ } finally { setRoomsLoading(false); }
  }

  async function loadProductOwners() {
    if (!id) return;
    setOwnersLoading(true);
    try {
      const res = await fetch(`${API_URL}/products/${id}/owners`, { headers: authHeaders() });
      const data = await res.json();
      setProductOwners(Array.isArray(data.owners) ? data.owners : []);
    } catch { /* silent */ } finally { setOwnersLoading(false); }
  }

  async function loadAllOwners() {
    if (allOwnersLoaded) return;
    try {
      const res = await fetch(`${API_URL}/owners`, { headers: authHeaders() });
      const data = await res.json();
      setAllOwners(Array.isArray(data.owners) ? data.owners : []);
      setAllOwnersLoaded(true);
    } catch { /* silent */ }
  }

  useEffect(() => {
    load();
    loadRooms();
    loadProductOwners();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Copy from similar ────────────────────────────────────────────────────────
  async function loadCopyProducts(type: string) {
    if (copyLoadedType === type) return;
    try {
      const res = await fetch(`${API_URL}/products?type=${type}&status=ACTIVE`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.products ?? []);
      setCopyProducts(list.filter((p: any) => p.id !== id));
      setCopyLoadedType(type);
    } catch { /* silent */ }
  }

  function handleCopyFrom(sourceId: string) {
    if (!sourceId) return;
    const source = copyProducts.find((p: any) => p.id === sourceId);
    if (!source) return;
    f({
      bedrooms:       source.bedrooms != null ? String(source.bedrooms) : form.bedrooms,
      suites:         source.suites != null ? String(source.suites) : form.suites,
      bathrooms:      source.bathrooms != null ? String(source.bathrooms) : form.bathrooms,
      parkingSpaces:  source.parkingSpaces != null ? String(source.parkingSpaces) : form.parkingSpaces,
      builtAreaM2:    source.builtAreaM2 != null ? String(source.builtAreaM2) : form.builtAreaM2,
      privateAreaM2:  source.privateAreaM2 != null ? String(source.privateAreaM2) : form.privateAreaM2,
      condominiumName: source.condominiumName ?? form.condominiumName,
      internalFeatures: Array.isArray(source.internalFeatures) && source.internalFeatures.length > 0
        ? source.internalFeatures : form.internalFeatures,
      condoFeatures:   Array.isArray(source.condoFeatures) && source.condoFeatures.length > 0
        ? source.condoFeatures : form.condoFeatures,
    });
    setSuccess("Dados copiados! Revise e salve.");
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/products/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/products");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao excluir produto");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!id || (isEmpreendimento && !form.title.trim())) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: any = {
        title: isEmpreendimento ? form.title.trim() : computedTitle,
        origin: form.origin,
        type: form.type,
        status: form.status,
        dealType: form.dealType || undefined,
        standard: form.standard || undefined,
        condition: form.condition || undefined,
        referenceCode: form.referenceCode.trim() || undefined,
        zipCode: form.zipCode.trim() || undefined,
        street: form.street.trim() || undefined,
        streetNumber: form.streetNumber.trim() || undefined,
        complement: form.complement.trim() || undefined,
        neighborhood: form.neighborhood.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        condominiumName: form.condominiumName.trim() || undefined,
        hideAddress: form.hideAddress,
        price: parseNum(form.price),
        rentPrice: parseNum(form.rentPrice),
        iptu: parseNum(form.iptu),
        condominiumFee: parseNum(form.condominiumFee),
        acceptsFinancing: form.acceptsFinancing,
        acceptsExchange: form.acceptsExchange,
        bedrooms: parseNum(form.bedrooms),
        suites: parseNum(form.suites),
        bathrooms: parseNum(form.bathrooms),
        parkingSpaces: parseNum(form.parkingSpaces),
        areaM2: parseNum(form.areaM2),
        builtAreaM2: parseNum(form.builtAreaM2),
        privateAreaM2: parseNum(form.privateAreaM2),
        landAreaM2: parseNum(form.landAreaM2),
        floor: parseNum(form.floor),
        totalFloors: parseNum(form.totalFloors),
        yearBuilt: parseNum(form.yearBuilt),
        sunPosition: form.sunPosition || undefined,
        furnished: form.furnished || undefined,
        internalFeatures: form.internalFeatures,
        condoFeatures: form.condoFeatures,
        registrationNumber: form.registrationNumber.trim() || undefined,
        propertySituation: form.propertySituation.trim() || undefined,
        hasExclusivity: form.hasExclusivity,
        exclusivityUntil: form.exclusivityUntil || undefined,
        virtualTourUrl: form.virtualTourUrl.trim() || undefined,
        description: form.description.trim() || undefined,
        tags: form.tags.trim() || undefined,
      };
      const updated = await updateProduct(id, payload);
      setProduct(updated);
      setSuccess("Produto salvo com sucesso.");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao salvar produto");
    } finally {
      setSaving(false);
    }
  }

  // ── Image upload ─────────────────────────────────────────────────────────────
  async function onUploadImage(file: File | null) {
    if (!id || !file) return;
    setImgUploading(true);
    setError(null);
    try {
      await uploadProductImage(id, file);
      await load();
      setSuccess("Imagem enviada.");
    } catch (e: any) {
      setError(e?.message ?? "Erro no upload");
    } finally { setImgUploading(false); }
  }

  // ── Doc upload / delete / download ──────────────────────────────────────────
  async function onUploadDoc(file: File | null) {
    if (!id || !file) return;
    setDocUploading(true);
    setError(null);
    try {
      await uploadProductDocument(id, {
        file, type: docType,
        category: guessCategoryFromOrigin(form.origin) as any,
        title: docTitle.trim() || undefined,
        notes: docNotes.trim() || undefined,
        visibility: docVisibility,
      } as any);
      setDocTitle(""); setDocNotes("");
      setSuccess("Documento enviado.");
      await loadDocs();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao enviar documento");
    } finally { setDocUploading(false); }
  }

  async function onDeleteDoc(docId: string) {
    if (!id || !confirm("Excluir este documento?")) return;
    setError(null);
    try {
      await deleteProductDocument(id, docId);
      setSuccess("Documento removido.");
      await loadDocs();
    } catch (e: any) { setError(e?.message ?? "Erro"); }
  }

  async function onDownloadDoc(d: any) {
    if (!id) return;
    setError(null);
    try {
      const docId = String(d?.id || "").trim();
      if (!docId) throw new Error("Documento inválido");
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
      const token = typeof window !== "undefined" ? (localStorage.getItem("accessToken") || "") : "";
      const resp = await fetch(`${baseUrl}/products/${id}/documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const cd = resp.headers.get("content-disposition");
      let filename = filenameFromCD(cd) || d?.title || "documento";
      if (!filename.includes(".")) {
        const ct = resp.headers.get("content-type") || "";
        if (ct.includes("pdf")) filename += ".pdf";
        else if (ct.includes("jpeg")) filename += ".jpg";
        else if (ct.includes("png")) filename += ".png";
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) { setError(e?.message ?? "Erro no download"); }
  }

  // ── Room CRUD ─────────────────────────────────────────────────────────────────
  async function handleAddRoom() {
    if (!id || !addLabel.trim()) return;
    setAddingRoom(true);
    try {
      const res = await fetch(`${API_URL}/products/${id}/rooms`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ type: addType, label: addLabel.trim() }),
      });
      const data = await res.json();
      if (data.room) setRooms((prev) => [...prev, data.room]);
      setAddStep("closed");
      setAddType(""); setAddLabel("");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar cômodo");
    } finally { setAddingRoom(false); }
  }

  async function handleUpdateRoom(
    roomId: string,
    updates: { label?: string; sizeM2?: string | null; notes?: string | null },
  ) {
    if (!id) return;
    try {
      const res = await fetch(`${API_URL}/products/${id}/rooms/${roomId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.room) setRooms((prev) => prev.map((r) => r.id === roomId ? data.room : r));
    } catch { /* silent — debounced, no need to surface */ }
  }

  async function handleDeleteRoom(roomId: string) {
    if (!id || !confirm("Excluir este cômodo e todas as suas fotos?")) return;
    try {
      await fetch(`${API_URL}/products/${id}/rooms/${roomId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch (e: any) { setError(e?.message ?? "Erro ao excluir cômodo"); }
  }

  async function handleAddRoomImage(roomId: string, file: File) {
    if (!id) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API_URL}/products/${id}/rooms/${roomId}/images`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    });
    const data = await res.json();
    if (data.image) {
      setRooms((prev) => prev.map((r) =>
        r.id === roomId ? { ...r, images: [...r.images, data.image] } : r,
      ));
    }
  }

  async function handleDeleteRoomImage(roomId: string, imageId: string) {
    if (!id) return;
    await fetch(`${API_URL}/products/${id}/rooms/${roomId}/images/${imageId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    setRooms((prev) => prev.map((r) =>
      r.id === roomId ? { ...r, images: r.images.filter((i) => i.id !== imageId) } : r,
    ));
  }

  // ── Owner handlers ────────────────────────────────────────────────────────────

  async function handleLinkOwner(ownerId: string) {
    if (!id) return;
    try {
      const res = await fetch(`${API_URL}/products/${id}/owners`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId }),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadProductOwners();
      setOwnerSearch("");
    } catch (e: any) { setError(e?.message ?? "Erro ao vincular proprietário"); }
  }

  async function handleUnlinkOwner(ownerId: string) {
    if (!id || !confirm("Desvincular este proprietário do imóvel?")) return;
    try {
      await fetch(`${API_URL}/products/${id}/owners/${ownerId}`, {
        method: "DELETE", headers: authHeaders(),
      });
      setProductOwners((prev) => prev.filter((o) => o.id !== ownerId));
    } catch (e: any) { setError(e?.message ?? "Erro ao desvincular"); }
  }

  async function handleOwnerCreated(owner: OwnerProfile) {
    if (!id) return;
    setShowNewOwner(false);
    try {
      const res = await fetch(`${API_URL}/products/${id}/owners`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: owner.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      setProductOwners((prev) => [...prev, owner]);
      setAllOwnersLoaded(false); // invalidate cache
    } catch (e: any) { setError(e?.message ?? "Erro ao vincular proprietário criado"); }
  }

  async function handleAddOwnerDocument(ownerId: string, file: File, type: string) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    const res = await fetch(`${API_URL}/owners/${ownerId}/documents`, {
      method: "POST", headers: authHeaders(), body: fd,
    });
    const data = await res.json();
    if (data.document) {
      setProductOwners((prev) => prev.map((o) =>
        o.id === ownerId ? { ...o, documents: [...o.documents, data.document] } : o,
      ));
    }
  }

  async function handleDeleteOwnerDocument(ownerId: string, docId: string) {
    await fetch(`${API_URL}/owners/${ownerId}/documents/${docId}`, {
      method: "DELETE", headers: authHeaders(),
    });
    setProductOwners((prev) => prev.map((o) =>
      o.id === ownerId ? { ...o, documents: o.documents.filter((d) => d.id !== docId) } : o,
    ));
  }

  // filtered search suggestions (exclude already linked)
  const linkedOwnerIds = useMemo(() => new Set(productOwners.map((o) => o.id)), [productOwners]);
  const ownerSuggestions = useMemo(() => {
    if (!ownerSearch.trim()) return [];
    const q = ownerSearch.toLowerCase();
    return allOwners
      .filter((o) => !linkedOwnerIds.has(o.id) && (o.name.toLowerCase().includes(q) || (o.cpf ?? "").includes(q)))
      .slice(0, 8);
  }, [ownerSearch, allOwners, linkedOwnerIds]);

  // ── Image visibility toggle ───────────────────────────────────────────────────
  async function handleToggleImagePublic(imageId: string, currentPublishSite: boolean) {
    if (!id) return;
    // Optimistic update
    setProduct((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        images: ((prev as any).images ?? []).map((img: any) =>
          img.id === imageId ? { ...img, publishSite: !currentPublishSite } : img,
        ),
      } as any;
    });
    try {
      await fetch(`${API_URL}/products/${id}/images/${imageId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ publishSite: !currentPublishSite }),
      });
    } catch {
      // Revert on error
      setProduct((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          images: ((prev as any).images ?? []).map((img: any) =>
            img.id === imageId ? { ...img, publishSite: currentPublishSite } : img,
          ),
        } as any;
      });
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const productImages = useMemo(() => {
    return ((product as any)?.images ?? []) as any[];
  }, [product]);

  const imageUrls = useMemo(() => {
    return [...new Set(productImages.map((i) => normalizeImageUrl(i)).filter(Boolean))] as string[];
  }, [productImages]);

  const headerTitle = useMemo(() => {
    if (loading) return "Produto";
    return computedTitle || "Novo imóvel";
  }, [loading, computedTitle]);

  // ── Add room panel helpers ────────────────────────────────────────────────────
  const addTypeConfig = ROOM_TYPE_CONFIG.find((r) => r.value === addType);

  function startAddType(typeValue: string) {
    const config = ROOM_TYPE_CONFIG.find((r) => r.value === typeValue)!;
    setAddType(typeValue);
    // Pre-select first suggestion (or empty for free label)
    setAddLabel(config.freeLabel ? "" : (config.suggestions[0] ?? ""));
    setAddStep("label");
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AppShell title="Produto">
      <form onSubmit={onSave}>
        <div className="mx-auto w-full max-w-3xl">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{headerTitle}</h1>
              <p className="text-xs text-gray-400 mt-0.5">ID: {id}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading || deleting}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
              >
                Excluir produto
              </button>
              <Link
                href="/products"
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Voltar
              </Link>
            </div>
          </div>

          {/* Delete confirmation modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                <h2 className="text-base font-semibold text-gray-900 mb-2">Excluir produto?</h2>
                <p className="text-sm text-gray-500 mb-6">Esta ação não pode ser desfeita.</p>
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? "Excluindo..." : "Sim, excluir"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {success}
            </div>
          )}

          <div className="space-y-3">

            {/* ── S1: Identificação ─────────────────────────────────────── */}
            <Section id="identificacao" title="1. Identificação" open={open.has("identificacao")} onToggle={() => toggle("identificacao")}>
              <div className="grid grid-cols-2 gap-4">
                {isEmpreendimento && (
                  <div className="col-span-2">
                    <Field label="Nome do empreendimento *">
                      <input value={form.title} onChange={(e) => f({ title: e.target.value })}
                        placeholder="Ex.: Residencial Vista Verde"
                        className={inp} disabled={loading} />
                    </Field>
                  </div>
                )}
                <Field label="Tipo *">
                  <select
                    value={form.type}
                    onChange={(e) => {
                      f({ type: e.target.value as ProductType });
                      setCopyProducts([]);
                      setCopyLoadedType(null);
                    }}
                    className={sel}
                    disabled={loading}
                  >
                    {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={(e) => f({ status: e.target.value })} className={sel} disabled={loading}>
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                    <option value="RESERVED">Reservado</option>
                    <option value="SOLD">Vendido</option>
                    <option value="SOLD_OUT">Esgotado</option>
                    <option value="ARCHIVED">Arquivado</option>
                  </select>
                </Field>
                <Field label="Finalidade">
                  <select value={form.dealType} onChange={(e) => f({ dealType: e.target.value })} className={sel} disabled={loading}>
                    <option value="SALE">Venda</option>
                    <option value="RENT">Locação</option>
                    <option value="BOTH">Venda e Locação</option>
                  </select>
                </Field>
                <Field label="Estado do imóvel">
                  <select value={form.condition} onChange={(e) => f({ condition: e.target.value })} className={sel} disabled={loading}>
                    <option value="">-</option>
                    <option value="NOVO">Novo</option>
                    <option value="USADO">Usado</option>
                    <option value="EM_CONSTRUCAO">Em construção</option>
                    <option value="NA_PLANTA">Na planta</option>
                  </select>
                </Field>
                <Field label="Padrão">
                  <select value={form.standard} onChange={(e) => f({ standard: e.target.value })} className={sel} disabled={loading}>
                    <option value="">-</option>
                    <option value="ECONOMICO">Econômico</option>
                    <option value="MEDIO">Médio</option>
                    <option value="ALTO">Alto</option>
                    <option value="LUXO">Luxo</option>
                  </select>
                </Field>
                <Field label="Código interno">
                  <input value={form.referenceCode} onChange={(e) => f({ referenceCode: e.target.value })}
                    placeholder="Ex.: AP-001" className={inp} disabled={loading} />
                </Field>
                <Field label="Origem">
                  <select value={form.origin} onChange={(e) => f({ origin: e.target.value })} className={sel} disabled={loading}>
                    <option value="THIRD_PARTY">Imóvel de terceiros</option>
                    <option value="DEVELOPMENT">Empreendimento/Loteamento</option>
                    <option value="OWN">Próprio</option>
                  </select>
                </Field>
              </div>
              {(form.type === "APARTAMENTO" || form.type === "CASA") && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5">
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Copiar dados de outro imóvel similar <span className="font-normal text-gray-400">(opcional)</span>
                  </label>
                  <select
                    className={`${sel} text-sm`}
                    defaultValue=""
                    onChange={(e) => handleCopyFrom(e.target.value)}
                    onFocus={() => loadCopyProducts(form.type)}
                    disabled={loading}
                  >
                    <option value="">— selecionar imóvel —</option>
                    {copyProducts.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.title || `${PRODUCT_TYPES.find((t) => t.value === p.type)?.label ?? p.type}${p.neighborhood ? ` - ${p.neighborhood}` : ""}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Field label="Descrição">
                <textarea value={form.description} onChange={(e) => f({ description: e.target.value })}
                  rows={3} className={`${inp} resize-y`} placeholder="Descrição do imóvel..." disabled={loading} />
              </Field>
            </Section>

            {/* ── S2: Localização ──────────────────────────────────────── */}
            <Section id="localizacao" title="2. Localização" open={open.has("localizacao")} onToggle={() => toggle("localizacao")}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="CEP">
                  <input value={form.zipCode}
                    onChange={(e) => f({ zipCode: e.target.value })}
                    onBlur={(e) => fetchCep(e.target.value)}
                    placeholder="00000-000" className={inp} disabled={loading} />
                </Field>
                <div />
                <div className="col-span-2">
                  <Field label="Rua / Logradouro">
                    <input value={form.street} onChange={(e) => f({ street: e.target.value })}
                      className={inp} disabled={loading} />
                  </Field>
                </div>
                <Field label="Número">
                  <input value={form.streetNumber} onChange={(e) => f({ streetNumber: e.target.value })}
                    className={inp} disabled={loading} />
                </Field>
                <Field label="Complemento">
                  <input value={form.complement} onChange={(e) => f({ complement: e.target.value })}
                    placeholder="Apto, bloco..." className={inp} disabled={loading} />
                </Field>
                <Field label="Bairro">
                  <input value={form.neighborhood} onChange={(e) => f({ neighborhood: e.target.value })}
                    className={inp} disabled={loading} />
                </Field>
                <Field label="Cidade">
                  <input value={form.city} onChange={(e) => f({ city: e.target.value })}
                    className={inp} disabled={loading} />
                </Field>
                <Field label="Estado (UF)">
                  <input value={form.state} onChange={(e) => f({ state: e.target.value })}
                    placeholder="SP" maxLength={2} className={inp} disabled={loading} />
                </Field>
                <div className="col-span-2">
                  <Field label="Nome do condomínio / empreendimento">
                    <input value={form.condominiumName} onChange={(e) => f({ condominiumName: e.target.value })}
                      placeholder="Ex.: Residencial das Flores" className={inp} disabled={loading} />
                  </Field>
                </div>
              </div>
              <Toggle checked={form.hideAddress} onChange={(v) => f({ hideAddress: v })} label="Ocultar endereço completo no site" />
            </Section>

            {/* ── S3: Valores ──────────────────────────────────────────── */}
            <Section id="valores" title="3. Valores" open={open.has("valores")} onToggle={() => toggle("valores")}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Preço de venda">
                  <CurrencyInput value={form.price} onChange={(v) => f({ price: v })} disabled={loading} />
                </Field>
                <Field label="Preço de locação (por mês)">
                  <CurrencyInput value={form.rentPrice} onChange={(v) => f({ rentPrice: v })} disabled={loading} />
                </Field>
                <Field label="IPTU anual">
                  <CurrencyInput value={form.iptu} onChange={(v) => f({ iptu: v })} disabled={loading} />
                </Field>
                <Field label="IPTU mensal (calculado)">
                  <div className={`${inp} bg-gray-50 text-gray-500`}>
                    {iptuMonthly ? `R$ ${iptuMonthly}` : "-"}
                  </div>
                </Field>
                <Field label="Condomínio mensal">
                  <CurrencyInput value={form.condominiumFee} onChange={(v) => f({ condominiumFee: v })} disabled={loading} />
                </Field>
              </div>
              <div className="flex flex-col gap-3 pt-1">
                <Toggle checked={form.acceptsFinancing} onChange={(v) => f({ acceptsFinancing: v })} label="Aceita financiamento" />
                <Toggle checked={form.acceptsExchange} onChange={(v) => f({ acceptsExchange: v })} label="Aceita permuta" />
              </div>
            </Section>

            {/* ── S4: Cômodos ───────────────────────────────────────────── */}
            <Section id="comodos" title="4. Cômodos" open={open.has("comodos")} onToggle={() => toggle("comodos")}>

              {roomsLoading ? (
                <p className="text-sm text-gray-400">Carregando cômodos...</p>
              ) : (
                <div className="space-y-3">
                  {rooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      onDelete={handleDeleteRoom}
                      onUpdate={handleUpdateRoom}
                      onAddImage={handleAddRoomImage}
                      onDeleteImage={handleDeleteRoomImage}
                    />
                  ))}

                  {/* Add room panel */}
                  {addStep === "closed" ? (
                    <button
                      type="button"
                      onClick={() => setAddStep("type")}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm text-gray-500 hover:border-slate-300 hover:text-gray-700 transition-colors"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Adicionar cômodo
                    </button>
                  ) : addStep === "type" ? (
                    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 space-y-3">
                      <p className="text-sm font-medium text-gray-700">Selecionar tipo de cômodo:</p>
                      <div className="grid grid-cols-3 gap-2">
                        {ROOM_TYPE_CONFIG.map((rt) => (
                          <button
                            key={rt.value}
                            type="button"
                            onClick={() => startAddType(rt.value)}
                            className="rounded-lg border bg-white px-3 py-2 text-sm hover:border-slate-400 hover:bg-slate-50 transition-colors text-left"
                          >
                            {rt.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setAddStep("closed")}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    // addStep === "label"
                    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 space-y-3">
                      <p className="text-sm font-medium text-gray-700">
                        Nome para <span className="font-semibold">{addTypeConfig?.label}</span>:
                      </p>

                      {/* Suggestions (for non-free-label types) */}
                      {!addTypeConfig?.freeLabel && addTypeConfig!.suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {addTypeConfig!.suggestions.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setAddLabel(s)}
                              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                                addLabel === s
                                  ? "border-slate-700 bg-slate-700 text-white"
                                  : "border-gray-200 bg-white text-gray-600 hover:border-slate-400"
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Always-editable label input */}
                      <input
                        value={addLabel}
                        onChange={(e) => setAddLabel(e.target.value)}
                        placeholder={
                          addTypeConfig?.freeLabel
                            ? 'Ex.: "Coberta", "Descoberta", "Moto"'
                            : "Editar nome..."
                        }
                        className={inp}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); handleAddRoom(); }
                          if (e.key === "Escape") setAddStep("type");
                        }}
                      />

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleAddRoom}
                          disabled={!addLabel.trim() || addingRoom}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {addingRoom ? "Criando..." : "Adicionar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddStep("type")}
                          className="rounded-lg border px-4 py-2 text-sm hover:bg-white"
                        >
                          Voltar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* ── S5: Comodidades ───────────────────────────────────────── */}
            <Section id="comodidades" title="5. Comodidades" open={open.has("comodidades")} onToggle={() => toggle("comodidades")}>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Internas</p>
                <div className="grid grid-cols-3 gap-y-2 gap-x-3">
                  {INTERNAL_FEATURES.map((feat) => (
                    <label key={feat} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.internalFeatures.includes(feat)}
                        onChange={() => toggleFeature("internalFeatures", feat)}
                        className="h-4 w-4 rounded border-gray-300"
                        disabled={loading}
                      />
                      {feat}
                    </label>
                  ))}
                </div>
              </div>
              <div className="pt-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Condomínio</p>
                <div className="grid grid-cols-3 gap-y-2 gap-x-3">
                  {CONDO_FEATURES.map((feat) => (
                    <label key={feat} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.condoFeatures.includes(feat)}
                        onChange={() => toggleFeature("condoFeatures", feat)}
                        className="h-4 w-4 rounded border-gray-300"
                        disabled={loading}
                      />
                      {feat}
                    </label>
                  ))}
                </div>
              </div>
            </Section>

            {/* ── S6: Proprietários ─────────────────────────────────────── */}
            <Section id="proprietarios" title="6. Proprietários" open={open.has("proprietarios")} onToggle={() => toggle("proprietarios")}>

              {ownersLoading ? (
                <p className="text-sm text-gray-400">Carregando proprietários...</p>
              ) : (
                <div className="space-y-2">
                  {productOwners.map((owner) => (
                    <OwnerCard
                      key={owner.id}
                      owner={owner}
                      onUnlink={handleUnlinkOwner}
                      onAddDocument={handleAddOwnerDocument}
                      onDeleteDocument={handleDeleteOwnerDocument}
                    />
                  ))}
                </div>
              )}

              {/* Search existing owner */}
              {!showNewOwner && (
                <div className="relative mt-2">
                  <input
                    value={ownerSearch}
                    onChange={(e) => setOwnerSearch(e.target.value)}
                    onFocus={loadAllOwners}
                    placeholder="Buscar proprietário cadastrado..."
                    className={inp}
                  />
                  {ownerSuggestions.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-md divide-y">
                      {ownerSuggestions.map((o) => (
                        <li key={o.id}>
                          <button type="button" onClick={() => handleLinkOwner(o.id)}
                            className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50">
                            <span className="font-medium text-gray-800">{o.name}</span>
                            <span className="text-xs text-gray-400">{o.cpf ?? ""}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Create new owner */}
              {showNewOwner ? (
                <NewOwnerForm onCreated={handleOwnerCreated} onCancel={() => setShowNewOwner(false)} />
              ) : (
                <button type="button" onClick={() => setShowNewOwner(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm text-gray-500 hover:border-slate-300 hover:text-gray-700 transition-colors">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Novo proprietário
                </button>
              )}
            </Section>

            {/* ── S7: Documentação ──────────────────────────────────────── */}
            <Section id="documentacao" title="7. Documentação" open={open.has("documentacao")} onToggle={() => toggle("documentacao")}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Matrícula">
                  <input value={form.registrationNumber} onChange={(e) => f({ registrationNumber: e.target.value })}
                    placeholder="Nº da matrícula" className={inp} disabled={loading} />
                </Field>
                <Field label="Situação do imóvel">
                  <input value={form.propertySituation} onChange={(e) => f({ propertySituation: e.target.value })}
                    placeholder="Ex.: Quitado, Financiado..." className={inp} disabled={loading} />
                </Field>
                <Field label="Link tour virtual">
                  <input value={form.virtualTourUrl} onChange={(e) => f({ virtualTourUrl: e.target.value })}
                    placeholder="https://..." className={inp} disabled={loading} />
                </Field>
                {form.hasExclusivity && (
                  <Field label="Validade da exclusividade">
                    <input type="date" value={form.exclusivityUntil}
                      onChange={(e) => f({ exclusivityUntil: e.target.value })}
                      className={inp} disabled={loading} />
                  </Field>
                )}
              </div>
              <Toggle checked={form.hasExclusivity} onChange={(v) => f({ hasExclusivity: v })} label="Exclusividade" />
            </Section>

            {/* ── S8: Mídia ────────────────────────────────────────────── */}
            <Section id="midia" title="8. Mídia" open={open.has("midia")} onToggle={() => {
              toggle("midia");
              if (!open.has("midia")) loadDocs();
            }}>

              {/* Fotos */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fotos</p>
                <label className="block">
                  <input type="file" accept="image/*" disabled={imgUploading || loading}
                    onChange={(e) => onUploadImage(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-50" />
                </label>
                {imgUploading && <p className="mt-1 text-xs text-gray-400">Enviando...</p>}
                {productImages.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {productImages.map((img: any) => {
                      const url = normalizeImageUrl(img);
                      const isPublic = img.publishSite !== false;
                      return (
                        <div key={img.id ?? url} className="relative overflow-hidden rounded-lg border bg-gray-50">
                          <a href={url ?? undefined} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url ?? undefined} alt="" className={`h-24 w-full object-cover transition-opacity ${isPublic ? "" : "opacity-40"}`} />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleToggleImagePublic(img.id, isPublic)}
                            title={isPublic ? "Pública — clique para tornar privada" : "Privada — clique para tornar pública"}
                            className="absolute top-1 right-1 rounded-full bg-white/90 p-1 shadow hover:bg-white transition-colors"
                          >
                            {isPublic ? (
                              <svg className="h-3.5 w-3.5 text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 3C5 3 1.73 7.11 1.05 8.45a1 1 0 000 1.1C1.73 10.89 5 15 10 15s8.27-4.11 8.95-5.45a1 1 0 000-1.1C18.27 7.11 15 3 10 3zm0 10a4 4 0 110-8 4 4 0 010 8zm0-6a2 2 0 100 4 2 2 0 000-4z" />
                              </svg>
                            ) : (
                              <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074L3.707 2.293zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                                <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Documentos */}
              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Documentos</p>
                <div className="rounded-lg border bg-gray-50 p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Tipo">
                      <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)} className={sel}>
                        <option value="BOOK">Book</option>
                        <option value="MEMORIAL">Memorial</option>
                        <option value="TABELA">Tabela</option>
                      </select>
                    </Field>
                    <Field label="Visibilidade">
                      <select value={docVisibility} onChange={(e) => setDocVisibility(e.target.value as DocVisibility)} className={sel}>
                        <option value="INTERNAL">Interno</option>
                        <option value="SHAREABLE">Compartilhável</option>
                      </select>
                    </Field>
                    <div className="col-span-2">
                      <Field label="Título (opcional)">
                        <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} className={inp} />
                      </Field>
                    </div>
                  </div>
                  <label className="block">
                    <input type="file" accept=".pdf,image/*" disabled={docUploading}
                      onChange={(e) => onUploadDoc(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-50" />
                  </label>
                  {docUploading && <p className="text-xs text-gray-400">Enviando...</p>}
                </div>

                {docsLoading ? (
                  <p className="mt-3 text-xs text-gray-400">Carregando...</p>
                ) : docs.length > 0 ? (
                  <ul className="mt-3 divide-y rounded-lg border bg-white">
                    {docs.map((d: any) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <div>
                          <span className="font-medium text-gray-800">{d.title || d.type || "-"}</span>
                          <span className="ml-2 text-xs text-gray-400">{d.visibility}</span>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button type="button" onClick={() => onDownloadDoc(d)}
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50">Baixar</button>
                          <button type="button" onClick={() => onDeleteDoc(d.id)}
                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">Excluir</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-gray-400">Nenhum documento.</p>
                )}
              </div>
            </Section>

          </div>

          {/* ── Fixed save footer ─────────────────────────────────────── */}
          <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 rounded-xl border bg-white px-5 py-3 shadow-md">
            <div className="text-xs text-gray-400">
              {loading ? "Carregando..." : `${form.title || "Sem título"} · ${form.status}`}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={load} disabled={loading || saving}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                Recarregar
              </button>
              <button type="submit" disabled={loading || saving || !form.title.trim()}
                className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>

        </div>
      </form>
    </AppShell>
  );
}
