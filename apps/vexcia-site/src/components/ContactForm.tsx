"use client";

import { FormEvent, useState } from "react";

const MARCAS = [
  { label: "VIA CRM", origem: "VEXCIA_SITE_VIACRM" },
  { label: "Valure", origem: "VEXCIA_SITE_VALURE" },
  { label: "Vex Imob", origem: "VEXCIA_SITE_VEXIMOB" },
  { label: "Outro assunto", origem: "VEXCIA_SITE_OUTRO" },
];

type Status = "idle" | "loading" | "success" | "error";

export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const form = e.currentTarget;
    const formData = new FormData(form);
    const marca = String(formData.get("marca") || "");
    const origem = MARCAS.find((m) => m.label === marca)?.origem || "VEXCIA_SITE_OUTRO";

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sales-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: formData.get("nome"),
          telefone: formData.get("telefone"),
          email: formData.get("email"),
          mensagem: formData.get("mensagem"),
          empresa: marca,
          origem,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Não foi possível enviar sua mensagem.");
      }

      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Não foi possível enviar sua mensagem.");
    }
  }

  if (status === "success") {
    return (
      <div className="vx-card" style={{ background: "var(--vx-navy)", color: "#fff", border: "none" }}>
        <p className="font-semibold">Mensagem enviada!</p>
        <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
          Obrigado pelo contato. Nosso time vai retornar em breve.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="vx-card flex flex-col gap-4">
      <div>
        <label className="text-sm font-medium" style={{ color: "var(--vx-ink)" }}>
          Nome *
        </label>
        <input
          name="nome"
          required
          className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
          style={{ border: "1px solid var(--vx-border)" }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium" style={{ color: "var(--vx-ink)" }}>
            Telefone / WhatsApp *
          </label>
          <input
            name="telefone"
            required
            className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
            style={{ border: "1px solid var(--vx-border)" }}
          />
        </div>
        <div>
          <label className="text-sm font-medium" style={{ color: "var(--vx-ink)" }}>
            Email
          </label>
          <input
            name="email"
            type="email"
            className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
            style={{ border: "1px solid var(--vx-border)" }}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium" style={{ color: "var(--vx-ink)" }}>
          Tenho interesse em
        </label>
        <select
          name="marca"
          className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
          style={{ border: "1px solid var(--vx-border)" }}
          defaultValue={MARCAS[0].label}
        >
          {MARCAS.map((m) => (
            <option key={m.label} value={m.label}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium" style={{ color: "var(--vx-ink)" }}>
          Mensagem
        </label>
        <textarea
          name="mensagem"
          rows={4}
          className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
          style={{ border: "1px solid var(--vx-border)" }}
        />
      </div>

      {status === "error" && (
        <p className="text-sm" style={{ color: "#c0392b" }}>
          {errorMsg}
        </p>
      )}

      <button type="submit" disabled={status === "loading"} className="vx-btn-primary justify-center">
        {status === "loading" ? "Enviando..." : "Enviar mensagem"}
      </button>
    </form>
  );
}
