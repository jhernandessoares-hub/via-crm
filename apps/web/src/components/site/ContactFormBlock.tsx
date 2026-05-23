"use client";

import { FormEvent, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export function ContactFormBlock({ slug, title }: { slug: string; title?: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`${API}/sites/public/${slug}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: fd.get("nome"),
          telefone: fd.get("telefone"),
          mensagem: fd.get("mensagem") || undefined,
        }),
      });
      setStatus(res.ok ? "ok" : "err");
    } catch {
      setStatus("err");
    }
  }

  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-sm font-semibold text-slate-950">{title || "Fale conosco"}</div>

      {status === "ok" ? (
        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Mensagem enviada! Em breve entraremos em contato.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            name="nome"
            required
            disabled={status === "sending"}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950 disabled:opacity-50"
            placeholder="Seu nome"
          />
          <input
            name="telefone"
            required
            disabled={status === "sending"}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950 disabled:opacity-50"
            placeholder="WhatsApp"
          />
          <textarea
            name="mensagem"
            rows={3}
            disabled={status === "sending"}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950 disabled:opacity-50"
            placeholder="Mensagem (opcional)"
          />
          {status === "err" && (
            <p className="text-xs text-red-600">Erro ao enviar. Tente novamente.</p>
          )}
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-full bg-slate-950 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {status === "sending" ? "Enviando..." : "Enviar"}
          </button>
        </form>
      )}
    </div>
  );
}
