"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { createDevelopment } from "@/lib/developments.service";

const inp = "w-full rounded-xl border border-[var(--shell-card-border)] bg-[var(--shell-input-bg)] px-3 py-2.5 text-sm text-[var(--shell-text)] outline-none focus:border-[var(--brand-accent)] transition-colors";
const sel = inp;

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[var(--shell-subtext)]">{hint}</p>}
    </div>
  );
}

export default function NovoEmpreendimentoPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"VERTICAL" | "HORIZONTAL">("VERTICAL");
  const [subtipo, setSubtipo] = useState("APARTAMENTO");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [sunOrientation, setSunOrientation] = useState("LESTE");
  const [prazoEntrega, setPrazoEntrega] = useState("");
  const [status, setStatus] = useState("LANCAMENTO");
  const [gridRows, setGridRows] = useState("10");
  const [gridCols, setGridCols] = useState("10");
  const [descricao, setDescricao] = useState("");

  const subtipoOptions = tipo === "VERTICAL"
    ? [{ value: "APARTAMENTO", label: "Apartamentos" }]
    : [
        { value: "CASA", label: "Casas" },
        { value: "LOTEAMENTO", label: "Loteamento / Terrenos" },
      ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { setError("Informe o nome do empreendimento"); return; }
    setSaving(true);
    setError(null);
    try {
      const dev = await createDevelopment({
        nome: nome.trim(),
        tipo,
        subtipo,
        endereco: endereco.trim() || undefined,
        cidade: cidade.trim() || undefined,
        estado: estado.trim() || undefined,
        sunOrientation,
        prazoEntrega: prazoEntrega || undefined,
        status,
        gridRows: parseInt(gridRows) || 10,
        gridCols: parseInt(gridCols) || 10,
        descricao: descricao.trim() || undefined,
      } as any);
      router.push(`/empreendimentos/${dev.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar empreendimento");
      setSaving(false);
    }
  }

  return (
    <AppShell title="Novo Empreendimento">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6">
          <button type="button" onClick={() => router.back()} className="text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-text)] mb-2">← Voltar</button>
          <h1 className="text-xl font-bold text-[var(--shell-text)]">Novo Empreendimento</h1>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 space-y-4">
            <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-wider">Identificação</p>

            <Field label="Nome do empreendimento *">
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Residencial Parque das Flores" className={inp} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Tipo">
                <select value={tipo} onChange={(e) => { setTipo(e.target.value as any); setSubtipo(e.target.value === "VERTICAL" ? "APARTAMENTO" : "CASA"); }} className={sel}>
                  <option value="VERTICAL">Vertical (Prédio)</option>
                  <option value="HORIZONTAL">Horizontal (Casas / Lotes)</option>
                </select>
              </Field>
              <Field label="Subtipo">
                <select value={subtipo} onChange={(e) => setSubtipo(e.target.value)} className={sel}>
                  {subtipoOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
                  <option value="LANCAMENTO">Lançamento</option>
                  <option value="EM_OBRA">Em Obra</option>
                  <option value="CONCLUIDO">Concluído</option>
                </select>
              </Field>
              <Field label="Previsão de entrega">
                <input type="date" value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)} className={inp} />
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 space-y-4">
            <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-wider">Localização</p>
            <Field label="Endereço">
              <input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número..." className={inp} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cidade">
                <input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="São Paulo" className={inp} />
              </Field>
              <Field label="Estado">
                <input value={estado} onChange={(e) => setEstado(e.target.value)} placeholder="SP" maxLength={2} className={inp} />
              </Field>
            </div>
            <Field label="Orientação solar (nascente)" hint="Indica de qual lado o sol nasce no terreno">
              <select value={sunOrientation} onChange={(e) => setSunOrientation(e.target.value)} className={sel}>
                <option value="NORTE">Norte</option>
                <option value="SUL">Sul</option>
                <option value="LESTE">Leste (Nascente)</option>
                <option value="OESTE">Oeste (Poente)</option>
              </select>
            </Field>
          </div>

          <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 space-y-4">
            <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-wider">Grade do Terreno</p>
            <p className="text-xs text-[var(--shell-subtext)]">Define o tamanho inicial do grid. Você poderá editar a forma do terreno na próxima tela.</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Linhas" hint="Eixo vertical (profundidade)">
                <input type="number" value={gridRows} onChange={(e) => setGridRows(e.target.value)} min={1} max={50} className={inp} />
              </Field>
              <Field label="Colunas" hint="Eixo horizontal (largura)">
                <input type="number" value={gridCols} onChange={(e) => setGridCols(e.target.value)} min={1} max={50} className={inp} />
              </Field>
            </div>
            <div className="rounded-xl bg-[var(--shell-bg)] p-3 text-center text-xs text-[var(--shell-subtext)]">
              Grid: {gridRows} × {gridCols} = {parseInt(gridRows || "0") * parseInt(gridCols || "0")} células
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5">
            <Field label="Descrição (opcional)">
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3}
                placeholder="Informações gerais sobre o empreendimento..." className={`${inp} resize-none`} />
            </Field>
          </div>

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => router.back()}
              className="rounded-xl border border-[var(--shell-card-border)] px-5 py-2.5 text-sm font-medium text-[var(--shell-text)] hover:bg-[var(--shell-hover)]">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="rounded-xl bg-[var(--brand-accent)] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
              {saving ? "Criando..." : "Criar Empreendimento"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
