"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";

export default function WhatsappSettingsPage() {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [token, setToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    apiFetch("/tenants/whatsapp-settings")
      .then((d: any) => {
        setPhoneNumberId(d.whatsappPhoneNumberId || "");
        setVerifyToken(d.whatsappVerifyToken || "");
        setTokenConfigured(!!d.whatsappTokenConfigured);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const body: any = {
        whatsappPhoneNumberId: phoneNumberId,
        whatsappVerifyToken: verifyToken,
      };
      if (token) body.whatsappToken = token;
      await apiFetch("/tenants/whatsapp-settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setMsg({ type: "ok", text: "Configurações salvas com sucesso!" });
      if (token) {
        setToken("");
        setTokenConfigured(true);
      }
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message || "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  const apiUrl = typeof window !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : "";
  const webhookUrl = `${apiUrl}/webhooks/whatsapp`;

  if (loading)
    return (
      <AppShell title="Configuração do WhatsApp">
        <div className="p-6 text-sm text-[var(--shell-subtext)]">Carregando...</div>
      </AppShell>
    );

  return (
    <AppShell title="Configuração do WhatsApp">
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--shell-text)]">Configuração do WhatsApp</h1>
          <p className="text-sm text-[var(--shell-subtext)] mt-1">
            Conecte seu número de WhatsApp Business com a Meta Cloud API.
          </p>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-1">
          <p className="font-medium">URL do Webhook (configurar na Meta):</p>
          <code
            className="block rounded px-3 py-2 text-xs break-all select-all border"
            style={{ background: "var(--shell-card-bg)", borderColor: "var(--shell-card-border)", color: "var(--shell-text)" }}
          >
            {webhookUrl}
          </code>
        </div>

        <form onSubmit={onSave} className="space-y-4">
          <Input
            label="Phone Number ID"
            hint="Encontrado em Meta for Developers → WhatsApp → Getting Started"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="ex: 123456789012345"
          />

          <Input
            label="Token de Acesso (Access Token)"
            type="password"
            hint={tokenConfigured
              ? "Token já configurado. Preencha apenas para alterar."
              : "Token permanente da sua conta de sistema."}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={tokenConfigured ? "••••••••••••••••" : "EAAxxxxxxxx..."}
          />

          <Input
            label="Verify Token"
            hint="Token que você vai colocar no painel da Meta ao registrar o webhook."
            value={verifyToken}
            onChange={(e) => setVerifyToken(e.target.value)}
            placeholder="ex: meu-token-secreto"
          />

          {msg && (
            <div
              className={`rounded-md px-4 py-3 text-sm border ${
                msg.type === "ok"
                  ? "bg-green-50 text-green-800 border-green-200"
                  : "bg-red-50 text-red-800 border-red-200"
              }`}
            >
              {msg.text}
            </div>
          )}

          <Button type="submit" loading={saving} className="w-full">
            {saving ? "Salvando..." : "Salvar configurações"}
          </Button>
        </form>

        <Card>
          <CardHeader>
            <CardTitle>Como configurar</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="list-decimal list-inside space-y-1 text-[var(--shell-subtext)] text-xs">
              <li>Crie um app na <strong>Meta for Developers</strong> com produto WhatsApp</li>
              <li>Em WhatsApp → Configuration, configure o Webhook com a URL acima</li>
              <li>No campo Verify Token, coloque o mesmo valor do campo acima</li>
              <li>Subscribe aos campos: <code>messages</code></li>
              <li>Copie o Phone Number ID e o Access Token para os campos acima</li>
            </ol>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
