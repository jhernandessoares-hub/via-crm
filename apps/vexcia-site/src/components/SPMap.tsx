"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { CIDADES, PROJETOS } from "@/data/projetos";

export default function SPMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);

  const cidadesComDados = useMemo(() => {
    return CIDADES.map((cidade) => {
      const projetos = PROJETOS.filter((p) => p.cidade === cidade.nome);
      const unidades = projetos.reduce((sum, p) => sum + p.unidades, 0);
      return { ...cidade, projetos, unidades };
    });
  }, []);

  const maxUnidades = Math.max(...cidadesComDados.map((c) => c.unidades));
  const [selecionada, setSelecionada] = useState<string | null>(cidadesComDados[0]?.nome ?? null);

  const atual = cidadesComDados.find((c) => c.nome === selecionada) ?? null;

  useEffect(() => {
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !mapContainerRef.current || mapRef.current) return;

      const map = L.map(mapContainerRef.current, {
        scrollWheelZoom: false,
      }).setView([-22.6, -47.6], 8);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      markersRef.current = layerGroup;
      mapRef.current = map;

      function raioDoPin(unidades: number) {
        const min = 9;
        const max = 22;
        const proporcao = Math.sqrt(unidades / maxUnidades);
        return min + (max - min) * proporcao;
      }

      cidadesComDados.forEach((c) => {
        const marker = L.circleMarker([c.lat, c.lng], {
          radius: raioDoPin(c.unidades),
          color: "#ffffff",
          weight: 2,
          fillColor: "#050a30",
          fillOpacity: 0.65,
        }).addTo(layerGroup);

        marker.bindTooltip(`${c.nome}: ${c.unidades.toLocaleString("pt-BR")} un.`, {
          direction: "top",
          offset: [0, -raioDoPin(c.unidades)],
        });

        marker.on("click", () => setSelecionada(c.nome));
        marker.on("mouseover", () => {
          marker.setStyle({ fillColor: "#0fa3d2", fillOpacity: 0.9 });
        });
        marker.on("mouseout", () => {
          const isSelected = selecionada === c.nome;
          marker.setStyle({
            fillColor: isSelected ? "#0fa3d2" : "#050a30",
            fillOpacity: isSelected ? 0.9 : 0.65,
          });
        });
      });
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8 items-start">
      <div className="vx-card" style={{ padding: 16 }}>
        <div
          ref={mapContainerRef}
          style={{ height: 420, width: "100%", borderRadius: 10, overflow: "hidden" }}
        />
        <p className="text-xs mt-2 text-center" style={{ color: "var(--vx-muted)" }}>
          Mapa real (OpenStreetMap). Use os controles de zoom (+/-) pra separar cidades próximas, e clique num
          ponto para ver os empreendimentos.
        </p>
      </div>

      <div className="vx-card" style={{ minHeight: 280 }}>
        {atual ? (
          <>
            <p className="vx-eyebrow">{atual.projetos.length} empreendimento(s)</p>
            <h3 className="mt-1 font-bold" style={{ color: "var(--vx-navy)", fontSize: 22 }}>
              {atual.nome}
            </h3>
            <p className="text-sm mt-1" style={{ color: "var(--vx-muted)" }}>
              {atual.unidades.toLocaleString("pt-BR")} unidades habitacionais
            </p>
            <ul className="mt-5 flex flex-col gap-3">
              {atual.projetos.map((p) => (
                <li
                  key={p.nome}
                  className="flex items-center justify-between gap-3 text-sm pb-3"
                  style={{ borderBottom: "1px solid var(--vx-border)" }}
                >
                  <div>
                    <div style={{ color: "var(--vx-ink)", fontWeight: 600 }}>{p.nome}</div>
                    <div style={{ color: "var(--vx-muted)" }}>{p.construtora}</div>
                  </div>
                  <div style={{ color: "var(--vx-navy)", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {p.unidades.toLocaleString("pt-BR")} un.
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p style={{ color: "var(--vx-muted)" }}>Selecione uma cidade no mapa.</p>
        )}
      </div>
    </div>
  );
}
