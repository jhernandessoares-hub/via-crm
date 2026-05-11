"use client";
import { useState, useEffect, useRef } from "react";
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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--shell-card-border)] bg-[var(--shell-card-bg)] p-5 space-y-4 shadow-sm">
      <p className="text-xs font-bold text-[var(--shell-subtext)] uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

declare global {
  interface Window { google: any; }
}

export default function NovoEmpreendimentoPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"VERTICAL" | "HORIZONTAL">("VERTICAL");
  const [subtipo, setSubtipo] = useState("APARTAMENTO");
  const [status, setStatus] = useState("LANCAMENTO");
  const [prazoEntrega, setPrazoEntrega] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [descricao, setDescricao] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  const subtipoOptions = tipo === "VERTICAL"
    ? [{ value: "APARTAMENTO", label: "Apartamentos" }]
    : [
        { value: "CASA", label: "Casas" },
        { value: "LOTEAMENTO", label: "Loteamento / Terrenos" },
      ];

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!key) { setMapReady(false); return; }
    if (window.google?.maps) { initMap(); return; }
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const wait = setInterval(() => { if (window.google?.maps) { clearInterval(wait); initMap(); } }, 100);
      return () => clearInterval(wait);
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly&libraries=places`;
    script.async = true;
    script.onload = initMap;
    document.head.appendChild(script);
  }, []);

  function initMap() {
    if (!mapRef.current || !window.google?.maps) return;
    const center = { lat: -15.7942, lng: -47.8822 }; // Brasília como padrão
    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: 14,
      mapTypeId: "satellite",
      tilt: 0,
      styles: [],
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
    });
    mapInstance.current = map;

    const marker = new window.google.maps.Marker({
      map,
      draggable: true,
      visible: false,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#2563eb",
        fillOpacity: 0.9,
        strokeColor: "#fff",
        strokeWeight: 2,
      },
    });
    markerRef.current = marker;

    map.addListener("click", (e: any) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      setLat(lat);
      setLng(lng);
      marker.setPosition({ lat, lng });
      marker.setVisible(true);
    });

    marker.addListener("dragend", (e: any) => {
      setLat(e.latLng.lat());
      setLng(e.latLng.lng());
    });

    if (window.google.maps.places && addressInputRef.current) {
      const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        types: ["geocode"],
        componentRestrictions: { country: "br" },
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place.geometry?.location) return;
        const la = place.geometry.location.lat();
        const ln = place.geometry.location.lng();
        setLat(la);
        setLng(ln);
        map.setCenter({ lat: la, lng: ln });
        map.setZoom(17);
        marker.setPosition({ lat: la, lng: ln });
        marker.setVisible(true);
        const comps = place.address_components ?? [];
        const get = (type: string) => comps.find((c: any) => c.types.includes(type))?.long_name ?? "";
        const getShort = (type: string) => comps.find((c: any) => c.types.includes(type))?.short_name ?? "";
        setEndereco(place.formatted_address ?? "");
        setCidade(get("administrative_area_level_2") || get("locality"));
        setEstado(getShort("administrative_area_level_1"));
      });
    }

    setMapReady(true);
  }

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
        status,
        prazoEntrega: prazoEntrega || undefined,
        endereco: endereco.trim() || undefined,
        cidade: cidade.trim() || undefined,
        estado: estado.trim() || undefined,
        descricao: descricao.trim() || undefined,
        lat: lat ?? undefined,
        lng: lng ?? undefined,
      } as any);
      router.push(`/gestao-empreendimentos/${dev.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao criar empreendimento");
      setSaving(false);
    }
  }

  return (
    <AppShell title="Novo Empreendimento">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6">
          <button type="button" onClick={() => router.back()}
            className="text-xs text-[var(--shell-subtext)] hover:text-[var(--shell-text)] mb-3 flex items-center gap-1 transition-colors">
            ← Voltar
          </button>
          <h1 className="text-2xl font-bold text-[var(--shell-text)]">Novo Empreendimento</h1>
          <p className="text-sm text-[var(--shell-subtext)] mt-1">Preencha os dados básicos. Você poderá adicionar torres, unidades e configurar o 3D depois.</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Identificação */}
          <SectionCard title="Identificação">
            <Field label="Nome do empreendimento *">
              <input value={nome} onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Residencial Parque das Flores" className={inp} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Tipo">
                <select value={tipo} onChange={(e) => {
                  setTipo(e.target.value as any);
                  setSubtipo(e.target.value === "VERTICAL" ? "APARTAMENTO" : "CASA");
                }} className={sel}>
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

          </SectionCard>

          {/* Localização */}
          <SectionCard title="Localização">
            <Field label="Endereço" hint="Digite para buscar o endereço no mapa automaticamente">
              <input ref={addressInputRef} value={endereco} onChange={(e) => setEndereco(e.target.value)}
                placeholder="Digite o endereço completo..." className={inp} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cidade">
                <input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="São Paulo" className={inp} />
              </Field>
              <Field label="Estado">
                <input value={estado} onChange={(e) => setEstado(e.target.value)} placeholder="SP" maxLength={2} className={inp} />
              </Field>
            </div>

            {/* Mapa */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">
                Localização no mapa
              </label>
              {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Latitude</label>
                      <input
                        type="number" step="any"
                        value={lat ?? ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          const newLat = isNaN(v) ? null : v;
                          setLat(newLat);
                          if (newLat && lng) {
                            mapInstance.current?.setCenter({ lat: newLat, lng });
                            mapInstance.current?.setZoom(17);
                            markerRef.current?.setPosition({ lat: newLat, lng });
                            markerRef.current?.setVisible(true);
                          }
                        }}
                        placeholder="-23.550520"
                        className={inp}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-[var(--shell-subtext)] uppercase tracking-wide">Longitude</label>
                      <input
                        type="number" step="any"
                        value={lng ?? ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          const newLng = isNaN(v) ? null : v;
                          setLng(newLng);
                          if (lat && newLng) {
                            mapInstance.current?.setCenter({ lat, lng: newLng });
                            mapInstance.current?.setZoom(17);
                            markerRef.current?.setPosition({ lat, lng: newLng });
                            markerRef.current?.setVisible(true);
                          }
                        }}
                        placeholder="-46.633308"
                        className={inp}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--shell-subtext)]">Ou clique diretamente no mapa para marcar o terreno</p>
                  <div ref={mapRef} className="w-full h-64 rounded-xl overflow-hidden border border-[var(--shell-card-border)]" />
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--shell-card-border)] p-6 text-center">
                  <p className="text-sm text-[var(--shell-subtext)]">Configure <code className="bg-[var(--shell-bg)] px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> para habilitar o mapa</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Latitude">
                      <input type="number" step="any" value={lat ?? ""} onChange={(e) => setLat(parseFloat(e.target.value) || null)} placeholder="-23.550520" className={inp} />
                    </Field>
                    <Field label="Longitude">
                      <input type="number" step="any" value={lng ?? ""} onChange={(e) => setLng(parseFloat(e.target.value) || null)} placeholder="-46.633308" className={inp} />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => router.back()}
              className="rounded-xl border border-[var(--shell-card-border)] px-5 py-2.5 text-sm font-medium text-[var(--shell-text)] hover:bg-[var(--shell-hover)] transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="rounded-xl bg-[var(--brand-accent)] px-7 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm">
              {saving ? "Criando..." : "Criar Empreendimento →"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
