"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Loader2, Users, List } from "lucide-react";

type Session = { id: string; nome: string; status: string; phoneNumber: string | null };

export default function NovaCampanhaPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [form, setForm] = useState({
    nome: "",
    sessionId: "",
    mensagem: "",
    delayMinSegundos: 5,
    delayMaxSegundos: 15,
  });
  const [salvando, setSalvando] = useState(false);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    apiFetch("/whatsapp-unofficial")
      .then((d) => setSessions(d.filter((s: Session) => s.status === "CONNECTED")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPreview(form.mensagem.replace(/\{\{nome\}\}/gi, "João Silva").replace(/\{\{telefone\}\}/gi, "11999999999"));
  }, [form.mensagem]);

  function set(field: string, value: any) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function salvar() {
    if (!form.nome.trim() || !form.sessionId || !form.mensagem.trim()) {
      alert("Preencha nome, sessão e mensagem");
      return;
    }
    if (form.delayMinSegundos < 5) { alert("Delay mínimo é 5 segundos"); return; }
    if (form.delayMaxSegundos < form.delayMinSegundos) { alert("Delay máximo deve ser ≥ mínimo"); return; }

    setSalvando(true);
    try {
      const c = await apiFetch("/campanhas", {
        method: "POST",
        body: JSON.stringify(form),
      });
      router.push(`/campanhas/${c.id}`);
    } catch (e: any) {
      alert(e?.message ?? "Erro ao criar campanha");
      setSalvando(false);
    }
  }

  return (
    <AppShell title="Nova Campanha">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Nova Campanha
          </h1>
        </div>

        <div
          className="p-6 rounded-xl border space-y-5"
          style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
        >
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
              Nome da campanha
            </label>
            <input
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              placeholder="Ex: Lançamento Março"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
            />
          </div>

          {/* Sessão */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
              Número WhatsApp Light
            </label>
            {sessions.length === 0 ? (
              <p className="text-sm" style={{ color: "#f59e0b" }}>
                Nenhum número conectado. Vá em Configurações → WhatsApp Light.
              </p>
            ) : (
              <select
                value={form.sessionId}
                onChange={(e) => set("sessionId", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
              >
                <option value="">Selecione um número</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}{s.phoneNumber ? ` (${s.phoneNumber})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Mensagem */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
              Mensagem
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                Use {"{{nome}}"} e {"{{telefone}}"} como variáveis
              </span>
            </label>
            <textarea
              value={form.mensagem}
              onChange={(e) => set("mensagem", e.target.value)}
              placeholder={"Olá {{nome}}, temos uma oportunidade especial para você!"}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
              style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
            />
            {preview && form.mensagem !== preview && (
              <div
                className="mt-2 p-3 rounded-lg text-xs"
                style={{ background: "var(--brand-accent-muted)", color: "var(--text-primary)" }}
              >
                <span className="font-medium" style={{ color: "var(--brand-accent)" }}>Preview: </span>
                {preview}
              </div>
            )}
          </div>

          {/* Delay */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
              Intervalo entre envios (segundos)
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Mínimo (≥5s)</label>
                <input
                  type="number"
                  min={5}
                  value={form.delayMinSegundos}
                  onChange={(e) => set("delayMinSegundos", Math.max(5, Number(e.target.value)))}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Máximo</label>
                <input
                  type="number"
                  min={form.delayMinSegundos}
                  value={form.delayMaxSegundos}
                  onChange={(e) => set("delayMaxSegundos", Math.max(form.delayMinSegundos, Number(e.target.value)))}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ borderColor: "var(--card-border)", background: "var(--shell-bg)", color: "var(--text-primary)" }}
                />
              </div>
            </div>
            <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
              Cada mensagem será enviada com um intervalo aleatório entre {form.delayMinSegundos}s e {form.delayMaxSegundos}s
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Após criar, você poderá adicionar contatos e fazer upload de mídia.
          </p>
          <button
            onClick={salvar}
            disabled={salvando}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--brand-accent)", color: "#fff" }}
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            Criar campanha
          </button>
        </div>
      </div>
    </AppShell>
  );
}
