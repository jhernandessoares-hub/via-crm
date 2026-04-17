"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { PALETTES, getPalette, applyPalette, type Palette } from "@/lib/palettes";

type Branding = {
  brandPalette: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
};

export default function BrandingPage() {
  const [branding, setBranding] = useState<Branding>({ brandPalette: null, logoUrl: null, faviconUrl: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch("/tenants/branding")
      .then((data: any) => setBranding(data))
      .finally(() => setLoading(false));
  }, []);

  const selectedPalette = getPalette(branding.brandPalette);

  async function savePalette(key: string) {
    setSaving(true);
    try {
      const updated: any = await apiFetch("/tenants/branding", {
        method: "PATCH",
        body: JSON.stringify({ brandPalette: key }),
      });
      setBranding(updated);
      applyPalette(getPalette(key));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(field: "logo" | "favicon", file: File) {
    const set = field === "logo" ? setUploadingLogo : setUploadingFavicon;
    set(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const token = localStorage.getItem("accessToken");
      const resp = await fetch(`${apiUrl}/tenants/branding/${field}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const updated = await resp.json();
      setBranding(updated);
      // Aplica logo dinamicamente na sidebar sem reload
      if (field === "logo" && updated.logoUrl) {
        document.querySelectorAll<HTMLImageElement>("[data-sidebar-logo]").forEach((img) => {
          img.src = updated.logoUrl;
        });
      }
      if (field === "favicon" && updated.faviconUrl) {
        let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
        if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
        link.href = updated.faviconUrl;
      }
    } finally {
      set(false);
    }
  }

  async function removeImage(field: "logo" | "favicon") {
    const set = field === "logo" ? setUploadingLogo : setUploadingFavicon;
    set(true);
    try {
      const updated: any = await apiFetch(`/tenants/branding/${field}`, { method: "DELETE" });
      setBranding(updated);
      if (field === "logo") {
        document.querySelectorAll<HTMLImageElement>("[data-sidebar-logo]").forEach((img) => {
          img.src = "/Novo%20modelo%20de%20Logo.png";
        });
      }
    } finally {
      set(false);
    }
  }

  if (loading) return (
    <AppShell title="Personalização">
      <div className="flex items-center justify-center h-64 text-[var(--shell-subtext)]">Carregando...</div>
    </AppShell>
  );

  return (
    <AppShell title="Personalização">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--shell-text)]">Personalização</h1>
          <p className="text-sm text-[var(--shell-subtext)] mt-1">
            Customize a identidade visual do seu CRM — logo, favicon e cores.
          </p>
        </div>

        {/* Paleta de cores */}
        <Card>
          <CardHeader>
            <CardTitle>Paleta de cores</CardTitle>
            <CardDescription>Escolha a combinação de cores da barra lateral.</CardDescription>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PALETTES.map((palette) => {
                const active = selectedPalette.key === palette.key;
                return (
                  <button
                    key={palette.key}
                    onClick={() => savePalette(palette.key)}
                    disabled={saving}
                    className="relative flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all"
                    style={{
                      borderColor: active ? palette.accent : "var(--shell-card-border)",
                      background: active ? `${palette.accent}10` : "var(--shell-card-bg)",
                    }}
                  >
                    {/* Preview da sidebar */}
                    <div
                      className="flex h-10 w-6 shrink-0 flex-col items-center justify-center gap-1 rounded-md"
                      style={{ background: palette.sidebarBg }}
                    >
                      <div className="h-1 w-3 rounded-full" style={{ background: palette.accentLight }} />
                      <div className="h-0.5 w-3 rounded-full opacity-40" style={{ background: "#8DA1C9" }} />
                      <div className="h-0.5 w-3 rounded-full opacity-40" style={{ background: "#8DA1C9" }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[var(--shell-text)]">{palette.label}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="h-3 w-3 rounded-full border border-white/20" style={{ background: palette.sidebarBg }} />
                        <span className="h-3 w-3 rounded-full" style={{ background: palette.accent }} />
                      </div>
                    </div>
                    {active && (
                      <span
                        className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ background: palette.accent }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {saved && (
              <p className="text-sm mt-3" style={{ color: "var(--brand-accent)" }}>
                ✓ Paleta aplicada com sucesso!
              </p>
            )}
          </CardBody>
        </Card>

        {/* Logo */}
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <CardDescription>
              Substitua a logo padrão VIA CRM pela logo da sua empresa. Formatos: PNG, JPG, SVG. Recomendado: fundo transparente.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-6">
              {/* Preview logo atual */}
              <div
                className="flex h-16 w-32 shrink-0 items-center justify-center rounded-xl p-2"
                style={{ background: selectedPalette.sidebarBg }}
              >
                <img
                  src={branding.logoUrl || "/Novo%20modelo%20de%20Logo.png"}
                  alt="Logo atual"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-[var(--shell-subtext)]">
                  {branding.logoUrl ? "Logo personalizada ativa." : "Usando logo padrão VIA CRM."}
                </p>
                <div className="flex gap-2">
                  <input ref={logoRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage("logo", f); }} />
                  <Button
                    onClick={() => logoRef.current?.click()}
                    loading={uploadingLogo}
                    size="sm"
                  >
                    {branding.logoUrl ? "Trocar logo" : "Fazer upload"}
                  </Button>
                  {branding.logoUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeImage("logo")}
                      loading={uploadingLogo}
                    >
                      Usar padrão VIA
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Favicon */}
        <Card>
          <CardHeader>
            <CardTitle>Favicon</CardTitle>
            <CardDescription>
              Ícone exibido na aba do navegador. Formato ideal: PNG 32×32 ou 64×64 pixels.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-6">
              {/* Preview favicon */}
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border"
                style={{ borderColor: "var(--shell-card-border)", background: "var(--shell-bg)" }}
              >
                <img
                  src={branding.faviconUrl || "/favicon.ico"}
                  alt="Favicon atual"
                  className="h-8 w-8 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-[var(--shell-subtext)]">
                  {branding.faviconUrl ? "Favicon personalizado ativo." : "Usando favicon padrão VIA CRM."}
                </p>
                <div className="flex gap-2">
                  <input ref={faviconRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage("favicon", f); }} />
                  <Button
                    onClick={() => faviconRef.current?.click()}
                    loading={uploadingFavicon}
                    size="sm"
                  >
                    {branding.faviconUrl ? "Trocar favicon" : "Fazer upload"}
                  </Button>
                  {branding.faviconUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeImage("favicon")}
                      loading={uploadingFavicon}
                    >
                      Usar padrão VIA
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <p className="text-xs text-[var(--shell-subtext)]">
          As alterações de paleta são aplicadas imediatamente. Logo e favicon atualizam após recarregar a página.
        </p>
      </div>
    </AppShell>
  );
}
