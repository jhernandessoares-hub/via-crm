"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type FormConfig = {
  type: string;
  name: string;
  formTitle: string;
  formSubtitle: string;
  primaryColor: string;
  thankYouMessage: string;
  fields: { key: string; label: string; type: string; required: boolean }[];
};

export default function LandingPage() {
  const { token } = useParams<{ token: string }>();
  const [config, setConfig] = useState<FormConfig | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/webhooks/channel/${token}/config`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) setConfig(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch(`${API_BASE}/webhooks/channel/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setSent(true);
    } catch {
      alert("Erro ao enviar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Carregando...</p>
      </div>
    );
  }

  if (notFound || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Formulário não encontrado.</p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-sm w-full rounded-2xl bg-white shadow-lg p-8 text-center">
          <div className="text-4xl mb-4">✅</div>
          <p className="text-gray-800 font-medium">{config.thankYouMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-sm w-full rounded-2xl bg-white shadow-lg overflow-hidden">
        {/* Header */}
        <div
          className="px-6 py-8 text-white text-center"
          style={{ backgroundColor: config.primaryColor || "#0f172a" }}
        >
          <h1 className="text-xl font-bold">{config.formTitle}</h1>
          {config.formSubtitle && (
            <p className="mt-2 text-sm opacity-80">{config.formSubtitle}</p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={submit} className="px-6 py-6 space-y-4">
          {config.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {field.label}
                {field.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  required={field.required}
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((p) => ({ ...p, [field.key]: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none"
                />
              ) : (
                <input
                  type={field.type}
                  required={field.required}
                  value={values[field.key] || ""}
                  onChange={(e) => setValues((p) => ({ ...p, [field.key]: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
              )}
            </div>
          ))}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: config.primaryColor || "#0f172a" }}
          >
            {submitting ? "Enviando..." : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}
