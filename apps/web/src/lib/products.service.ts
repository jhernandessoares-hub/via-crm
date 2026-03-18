// C:\Users\User\Documents\via-crm\apps\web\src\lib\products.service.ts
import { apiFetch } from "@/lib/api";

// ==============================
// Types
// ==============================

export type ProductImage =
  | string
  | {
      id?: string;
      url?: string;
      src?: string;
      path?: string;
      createdAt?: string;
      isPrimary?: boolean;
      sortOrder?: number;
      [k: string]: any;
    };

export type ProductVideo = {
  id?: string;
  url: string;
  title?: string;
  publishSite?: boolean;
  publishSocial?: boolean;
  sortOrder?: number;
  createdAt?: string;
  [k: string]: any;
};

export type ProductDocument = {
  id: string;
  url: string;
  publicId?: string;
  title?: string;
  category?: string; // ENTERPRISE | PROPERTY | SELLER | OTHER
  type?: string; // BOOK | MEMORIAL | TABELA | ...
  notes?: string;
  visibility?: string; // INTERNAL | SHAREABLE
  aiExtractable?: boolean;
  versionLabel?: string;
  uploadedByUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: any;
};

export type Product = {
  id: string;

  // backend atual (prisma)
  title?: string;
  origin?: "OWN" | "THIRD_PARTY" | "DEVELOPMENT";
  type?: string; // ProductType
  status?: string; // ProductStatus
  price?: number | string | null;
  city?: string | null;
  neighborhood?: string | null;
  description?: string | null;

  // legado
  name?: string;
  sku?: string;
  active?: boolean;

  images?: ProductImage[];
  videos?: ProductVideo[];
  documents?: ProductDocument[];

  createdAt?: string;
  updatedAt?: string;

  [key: string]: any;
};

export type CreateProductInput = {
  title: string;
  origin: "OWN" | "THIRD_PARTY" | "DEVELOPMENT";
  type: string;
  status?: string;
  city?: string;
  neighborhood?: string;
  description?: string;
  price?: number;
};

export type UpdateProductInput = Partial<CreateProductInput>;

// ==============================
// Helpers (normalização)
// ==============================

function normalizeDocType(v?: string): string | undefined {
  if (!v) return v;

  // já está no enum
  const upper = v.trim().toUpperCase();
  const allowed = new Set([
    "PLANTA",
    "MEMORIAL",
    "BOOK",
    "TABELA",
    "REGULAMENTO",
    "OUTROS",
    "FOTOS",
    "APRESENTACAO",
    "CONTRATO_MINUTA",
    "LAUDO_VISTORIA",
    "CERTIDAO",
    "ESCRITURA",
    "REGISTRO_IMOVEL",
    "MATRICULA_IMOVEL",
    "IPTU",
    "CONDOMINIO",
    "HABITE_SE",
    "AVCB",
    "ART_RRT",
    "PROCURACAO",
    "DECLARACAO",
    "COMPROVANTE_ENDERECO",
    "COMPROVANTE_RENDA",
    "SELLER_RG",
    "SELLER_CPF",
    "SELLER_CNH",
    "SELLER_CNPJ",
    "SELLER_CONTRATO_SOCIAL",
    "BOLETO",
    "COMPROVANTE_PAGAMENTO",
  ]);
  if (allowed.has(upper)) return upper;

  // mapeia labels amigáveis
  const map: Record<string, string> = {
    BOOK: "BOOK",
    "BOOK/MANUAL": "BOOK",
    "LIVRO": "BOOK",
    MEMORIAL: "MEMORIAL",
    "MEMORIAL DESCRITIVO": "MEMORIAL",
    TABELA: "TABELA",
    "TABELA DE PREÇO": "TABELA",
    "TABELA DE PRECOS": "TABELA",
    PLANTA: "PLANTA",
    FOTOS: "FOTOS",
    APRESENTACAO: "APRESENTACAO",
    OUTROS: "OUTROS",

    // o seu select provavelmente manda "Book" (capitalize)
    "BOOK ": "BOOK",
    "BOOK  ": "BOOK",
  };

  // tenta com o original (ex: "Book")
  const originalKey = v.trim();
  const originalUpper = originalKey.toUpperCase();
  return map[originalKey] ?? map[originalUpper] ?? upper;
}

function normalizeDocVisibility(v?: string): string | undefined {
  if (!v) return v;

  const s = v.trim();

  // já enum
  const upper = s.toUpperCase();
  if (upper === "INTERNAL" || upper === "SHAREABLE") return upper;

  // mapeia PT -> enum
  if (upper === "INTERNO") return "INTERNAL";
  if (upper === "COMPARTILHAVEL" || upper === "COMPARTILHÁVEL") return "SHAREABLE";

  return upper;
}

function normalizeDocCategory(v?: string): string | undefined {
  if (!v) return v;
  const upper = v.trim().toUpperCase();
  if (upper === "ENTERPRISE" || upper === "PROPERTY" || upper === "SELLER" || upper === "OTHER") return upper;
  return upper;
}

// ==============================
// Products CRUD
// ==============================

export async function listProducts(): Promise<Product[]> {
  const data = await apiFetch("/products", { method: "GET" });
  return Array.isArray(data) ? (data as Product[]) : [];
}

export async function getProduct(id: string): Promise<Product> {
  return apiFetch(`/products/${encodeURIComponent(id)}`, {
    method: "GET",
  }) as Promise<Product>;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  return apiFetch("/products", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<Product>;
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  return apiFetch(`/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }) as Promise<Product>;
}

// ==============================
// Images
// ==============================

export async function uploadProductImage(
  id: string,
  file: File
): Promise<{ url?: string; image?: any; product?: Product; [k: string]: any }> {
  const form = new FormData();
  form.append("file", file);

  return apiFetch(`/products/${encodeURIComponent(id)}/images`, {
    method: "POST",
    body: form,
  }) as Promise<{ url?: string; image?: any; product?: Product; [k: string]: any }>;
}

export function normalizeImageUrl(img: ProductImage): string | null {
  if (!img) return null;
  if (typeof img === "string") return img;
  return img.url ?? img.src ?? img.path ?? null;
}

// ==============================
// Documents
// ==============================

export async function listProductDocuments(id: string): Promise<ProductDocument[]> {
  const data = await apiFetch(`/products/${encodeURIComponent(id)}/documents`, { method: "GET" });

  // backend pode retornar array direto OU { ok: true, documents: [] }
  if (Array.isArray(data)) return data as ProductDocument[];

  const docs = (data as any)?.documents;
  if (Array.isArray(docs)) return docs as ProductDocument[];

  return [];
}

export async function uploadProductDocument(
  id: string,
  args: {
    file: File;
    type: string; // UI pode mandar "Book", backend quer "BOOK"
    category?: string; // ENTERPRISE/PROPERTY...
    title?: string;
    visibility?: string; // UI pode mandar "Interno", backend quer "INTERNAL"
    notes?: string;
    aiExtractable?: boolean; // não enviar no multipart por enquanto
    versionLabel?: string;
  }
): Promise<{ ok?: boolean; document?: ProductDocument; product?: Product; [k: string]: any }> {
  const form = new FormData();

  form.append("file", args.file);

  const type = normalizeDocType(args.type) ?? args.type;
  const visibility = normalizeDocVisibility(args.visibility) ?? args.visibility;
  const category = normalizeDocCategory(args.category) ?? args.category;

  form.append("type", type);

  if (category) form.append("category", category);
  if (args.title) form.append("title", args.title);
  if (visibility) form.append("visibility", visibility);
  if (args.notes) form.append("notes", args.notes);

  // ✅ NÃO enviar aiExtractable em multipart (evita erro "must be a boolean value")
  // if (typeof args.aiExtractable === "boolean") form.append("aiExtractable", String(args.aiExtractable));

  if (args.versionLabel) form.append("versionLabel", args.versionLabel);

  return apiFetch(`/products/${encodeURIComponent(id)}/documents`, {
    method: "POST",
    body: form,
  }) as Promise<{ ok?: boolean; document?: ProductDocument; product?: Product; [k: string]: any }>;
}

export async function deleteProductDocument(id: string, docId: string): Promise<{ ok: boolean; [k: string]: any }> {
  return apiFetch(`/products/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}`, {
    method: "DELETE",
  }) as Promise<{ ok: boolean; [k: string]: any }>;
}