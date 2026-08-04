"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";

type WaLightSession = {
  id: string;
  nome: string;
  status: string;
  phoneNumber?: string | null;
};

interface NovoLeadModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NovoLeadModal({ open, onClose, onCreated }: NovoLeadModalProps) {
  const { can: canPerm } = usePermissions();

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [iniciarContatoIA, setIniciarContatoIA] = useState(false);
  const [sessionIdEscolhida, setSessionIdEscolhida] = useState("");
  const [sessoesLight, setSessoesLight] = useState<WaLightSession[]>([]);

  useEffect(() => {
    apiFetch("/inbox-wa-light")
      .then((d) => setSessoesLight(Array.isArray(d) ? d : []))
      .catch(() => setSessoesLight([]));
  }, []);

  function resetForm() {
    setNome("");
    setTelefone("");
    setObservacao("");
    setIniciarContatoIA(false);
    setSessionIdEscolhida("");
    setErro(null);
  }

  async function createLead() {
    setErro(null);
    setSaving(true);
    try {
      await apiFetch("/leads", {
        method: "POST",
        body: JSON.stringify({
          nome,
          telefone,
          observacao,
          iniciarContatoIA: iniciarContatoIA || undefined,
          sessionId: (iniciarContatoIA && sessionIdEscolhida) || undefined,
        }),
      });
      resetForm();
      onClose();
      onCreated();
    } catch (e: any) {
      setErro(e?.message || "Erro ao criar lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
      }}
      title="Novo Lead"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={createLead}>
            {saving ? "Salvando..." : "Salvar lead"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </div>
        )}
        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: João Silva" />
        <Input label="Telefone / WhatsApp" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Ex: (11) 99999-9999" />
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[var(--shell-subtext)]">
            {iniciarContatoIA ? "Interesse (a IA vai mencionar isso na primeira mensagem)" : "Observação (opcional)"}
          </label>
          <textarea
            className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
            style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
            rows={3}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder={iniciarContatoIA ? "Ex: apartamento 2 quartos na zona sul..." : "Ex: quer apartamento 2 quartos..."}
          />
        </div>

        {canPerm("leads", "contatoProativoIa") && (
          <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--shell-card-border)" }}>
            <label className="flex items-center gap-2 text-sm font-medium text-[var(--shell-text)]">
              <input
                type="checkbox"
                checked={iniciarContatoIA}
                onChange={(e) => setIniciarContatoIA(e.target.checked)}
              />
              Iniciar contato via IA (WhatsApp Light)
            </label>

            {iniciarContatoIA && (() => {
              const conectadas = sessoesLight.filter((s) => s.status === "CONNECTED");
              if (conectadas.length === 0) {
                return (
                  <div className="text-xs text-amber-600">
                    Nenhuma sessão WhatsApp Light conectada — o lead será criado, mas sem envio de mensagem.
                  </div>
                );
              }
              if (conectadas.length > 1) {
                return (
                  <select
                    value={sessionIdEscolhida}
                    onChange={(e) => setSessionIdEscolhida(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ background: "var(--shell-input-bg)", color: "var(--shell-input-text)", borderColor: "var(--shell-input-border)" }}
                  >
                    <option value="">(Selecione o número...)</option>
                    {conectadas.map((s) => (
                      <option key={s.id} value={s.id}>
                        {"📱 " + s.nome + (s.phoneNumber ? ` (${s.phoneNumber})` : "")}
                      </option>
                    ))}
                  </select>
                );
              }
              return null;
            })()}
          </div>
        )}
      </div>
    </Modal>
  );
}
