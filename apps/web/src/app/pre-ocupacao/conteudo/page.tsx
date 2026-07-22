"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/api";
import { useSP9Guard } from "../_lib/useSP9Guard";
import { FileUploadButton } from "../_lib/FileUploadButton";
import { formatDateTime } from "../_lib/constants";

type Conteudo = {
  id: string;
  titulo: string;
  descricao: string | null;
  url: string;
  mimeType: string | null;
  oculto: boolean;
  criadoPor: string;
  criadoEm: string;
};

function tipoLabel(mimeType: string | null): string {
  if (!mimeType) return "Arquivo";
  if (mimeType.startsWith("image/")) return "Imagem";
  if (mimeType.startsWith("video/")) return "Vídeo";
  return "Apresentação/Documento";
}

export default function ConteudoPage() {
  const guard = useSP9Guard();

  const [items, setItems] = useState<Conteudo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    if (guard !== true) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/pre-ocupacao/conteudo");
      setItems(res);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar conteúdos");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file: File) {
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("titulo", titulo || file.name);
      if (descricao) fd.set("descricao", descricao);
      await apiFetch("/pre-ocupacao/conteudo", { method: "POST", body: fd });
      setTitulo("");
      setDescricao("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao subir arquivo");
    }
  }

  async function toggleVisibilidade(id: string) {
    try {
      await apiFetch(`/pre-ocupacao/conteudo/${id}/visibilidade`, { method: "PATCH" });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao alterar visibilidade");
    }
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este conteúdo? Ele deixa de aparecer para as famílias imediatamente.")) return;
    try {
      await apiFetch(`/pre-ocupacao/conteudo/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Erro ao excluir conteúdo");
    }
  }

  if (guard === null) return null;

  return (
    <AppShell title="Pré-Ocupação — Conteúdo e Mídias">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "var(--shell-text)" }}>
            Conteúdo e Mídias
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
            Apresentações, vídeos e imagens exibidos na área logada das famílias (Portal Família).
          </p>
        </div>

        <Card className="mb-6">
          <CardBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>
                  Título
                </label>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Vídeo de boas-vindas"
                  className="h-10 w-full rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--shell-subtext)" }}>
                  Descrição (opcional)
                </label>
                <input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Breve descrição"
                  className="h-10 w-full rounded-lg border px-3 text-sm bg-[var(--shell-input-bg)] text-[var(--shell-input-text)] border-[var(--shell-input-border)]"
                />
              </div>
            </div>
            <FileUploadButton
              label="Subir apresentação, vídeo ou imagem"
              accept="image/*,video/*,application/pdf,.ppt,.pptx"
              onSelect={handleUpload}
            />
          </CardBody>
        </Card>

        {error && (
          <div className="mb-4 rounded-md px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>
            {error}
          </div>
        )}

        <div className="space-y-2">
          {loading && <p style={{ color: "var(--shell-subtext)" }}>Carregando...</p>}
          {!loading && items.length === 0 && (
            <Card>
              <CardBody className="text-center py-8">
                <p style={{ color: "var(--shell-subtext)" }}>Nenhum conteúdo cadastrado ainda.</p>
              </CardBody>
            </Card>
          )}
          {!loading &&
            items.map((item) => (
              <Card key={item.id}>
                <CardBody className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate" style={{ color: "var(--shell-text)" }}>
                        {item.titulo}
                      </p>
                      <Badge variant={item.oculto ? "default" : "success"}>
                        {item.oculto ? "Oculto" : "Visível"}
                      </Badge>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--shell-subtext)" }}>
                      {tipoLabel(item.mimeType)} · {formatDateTime(item.criadoEm)} · {item.criadoPor}
                    </p>
                    {item.descricao && (
                      <p className="text-sm mt-1" style={{ color: "var(--shell-subtext)" }}>
                        {item.descricao}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--shell-card-border)]"
                      style={{ color: "var(--shell-text)" }}
                    >
                      Ver
                    </a>
                    <button
                      onClick={() => toggleVisibilidade(item.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--shell-card-border)]"
                      style={{ color: "var(--shell-text)" }}
                    >
                      {item.oculto ? "Exibir" : "Ocultar"}
                    </button>
                    <button
                      onClick={() => excluir(item.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600"
                    >
                      Excluir
                    </button>
                  </div>
                </CardBody>
              </Card>
            ))}
        </div>
      </div>
    </AppShell>
  );
}
