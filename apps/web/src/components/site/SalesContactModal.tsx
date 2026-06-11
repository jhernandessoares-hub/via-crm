"use client";

import { useState } from "react";

// WhatsApp comercial — destino das conversas iniciadas pelo site institucional
const SALES_WHATSAPP = "5519984025179";

const API = process.env.NEXT_PUBLIC_API_URL || "";

const FUNCIONARIOS_OPTS = ["1 a 3", "4 a 10", "11 a 30", "31 a 100", "Mais de 100"];

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SalesContactModal({ open, onClose }: Props) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [numFuncionarios, setNumFuncionarios] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setNome("");
    setTelefone("");
    setEmail("");
    setEmpresa("");
    setNumFuncionarios("");
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nome.trim() || !telefone.trim()) {
      setError("Preencha pelo menos nome e telefone.");
      return;
    }

    setSubmitting(true);
    try {
      // Registra o lead comercial no Platform Admin (best-effort: não bloqueia o WhatsApp)
      await fetch(`${API}/sales-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, telefone, email, empresa, numFuncionarios }),
      }).catch(() => null);

      // Abre o WhatsApp comercial com a mensagem pré-preenchida
      const linhas = [
        "Olá! Quero conhecer o VIA CRM.",
        "",
        `Nome: ${nome}`,
        `Telefone: ${telefone}`,
        email ? `E-mail: ${email}` : "",
        empresa ? `Empresa: ${empresa}` : "",
        numFuncionarios ? `Funcionários: ${numFuncionarios}` : "",
      ].filter(Boolean);
      const texto = encodeURIComponent(linhas.join("\n"));
      window.open(`https://wa.me/${SALES_WHATSAPP}?text=${texto}`, "_blank");

      reset();
      onClose();
    } catch {
      setError("Não foi possível enviar agora. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(2, 6, 23, 0.7)" }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Falar com vendas</h2>
            <p className="mt-1 text-sm text-slate-500">
              Preencha seus dados e iniciamos a conversa no WhatsApp.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <Field label="Nome*" value={nome} onChange={setNome} placeholder="Seu nome" />
          <Field
            label="Telefone / WhatsApp*"
            value={telefone}
            onChange={setTelefone}
            placeholder="(19) 99999-9999"
            type="tel"
          />
          <Field
            label="E-mail"
            value={email}
            onChange={setEmail}
            placeholder="voce@empresa.com"
            type="email"
          />
          <Field label="Nome da empresa" value={empresa} onChange={setEmpresa} placeholder="Sua imobiliária" />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Quantos funcionários</label>
            <select
              value={numFuncionarios}
              onChange={(e) => setNumFuncionarios(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">Selecione…</option>
              {FUNCIONARIOS_OPTS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {submitting ? "Enviando…" : "Conversar no WhatsApp"}
          </button>
          <p className="text-center text-xs text-slate-400">
            Ao enviar, você será direcionado ao nosso WhatsApp comercial.
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
      />
    </div>
  );
}
