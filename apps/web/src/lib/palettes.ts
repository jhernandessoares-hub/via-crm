export type Palette = {
  key: string;
  label: string;
  sidebarBg: string;
  sidebarText: string;
  sidebarTextMuted: string;
  sidebarHover: string;
  sidebarBorder: string;
  sidebarFunnelBorder: string;
  accent: string;
  accentLight: string;
  accentMuted: string;
  preview: string;
};

export const PALETTES: Palette[] = [
  {
    key: "verde-via",
    label: "Verde VIA",
    sidebarBg: "#0D1B3E",
    sidebarText: "rgba(255,255,255,0.92)",
    sidebarTextMuted: "#8DA1C9",
    sidebarHover: "#142450",
    sidebarBorder: "#1A2A55",
    sidebarFunnelBorder: "rgba(26,42,85,0.6)",
    accent: "#1D9E75",
    accentLight: "#5DCAA5",
    accentMuted: "rgba(29,158,117,0.18)",
    preview: "#1D9E75",
  },
  {
    key: "azul-royal",
    label: "Azul Royal",
    sidebarBg: "#0A1628",
    sidebarText: "rgba(255,255,255,0.92)",
    sidebarTextMuted: "#8DA1C9",
    sidebarHover: "#0F2040",
    sidebarBorder: "#152035",
    sidebarFunnelBorder: "rgba(15,32,64,0.6)",
    accent: "#2563EB",
    accentLight: "#60A5FA",
    accentMuted: "rgba(37,99,235,0.18)",
    preview: "#2563EB",
  },
  {
    key: "roxo-corporativo",
    label: "Roxo Corporativo",
    sidebarBg: "#16102A",
    sidebarText: "rgba(255,255,255,0.92)",
    sidebarTextMuted: "#A89BC2",
    sidebarHover: "#231840",
    sidebarBorder: "#2D2050",
    sidebarFunnelBorder: "rgba(35,24,64,0.6)",
    accent: "#7C3AED",
    accentLight: "#A78BFA",
    accentMuted: "rgba(124,58,237,0.18)",
    preview: "#7C3AED",
  },
  {
    key: "grafite",
    label: "Grafite",
    sidebarBg: "#18181B",
    sidebarText: "rgba(255,255,255,0.92)",
    sidebarTextMuted: "#71717A",
    sidebarHover: "#27272A",
    sidebarBorder: "#27272A",
    sidebarFunnelBorder: "rgba(39,39,42,0.6)",
    accent: "#71717A",
    accentLight: "#A1A1AA",
    accentMuted: "rgba(113,113,122,0.18)",
    preview: "#71717A",
  },
  {
    key: "bordô",
    label: "Bordô",
    sidebarBg: "#1A0A0F",
    sidebarText: "rgba(255,255,255,0.92)",
    sidebarTextMuted: "#C9899A",
    sidebarHover: "#2D1020",
    sidebarBorder: "#2D1020",
    sidebarFunnelBorder: "rgba(45,16,32,0.6)",
    accent: "#BE123C",
    accentLight: "#FB7185",
    accentMuted: "rgba(190,18,60,0.18)",
    preview: "#BE123C",
  },
  {
    key: "claro",
    label: "Claro",
    sidebarBg: "#F5F6FA",
    sidebarText: "#1E293B",
    sidebarTextMuted: "#64748B",
    sidebarHover: "#E2E8F0",
    sidebarBorder: "#E2E8F0",
    sidebarFunnelBorder: "rgba(226,232,240,0.8)",
    accent: "#1D9E75",
    accentLight: "#1D9E75",
    accentMuted: "rgba(29,158,117,0.12)",
    preview: "#F5F6FA",
  },
];

export const DEFAULT_PALETTE = PALETTES[0];

export function getPalette(key?: string | null): Palette {
  return PALETTES.find((p) => p.key === key) ?? DEFAULT_PALETTE;
}

export function applyPalette(palette: Palette) {
  const root = document.documentElement;
  root.style.setProperty("--sidebar-bg", palette.sidebarBg);
  root.style.setProperty("--sidebar-text", palette.sidebarText);
  root.style.setProperty("--sidebar-text-muted", palette.sidebarTextMuted);
  root.style.setProperty("--sidebar-hover", palette.sidebarHover);
  root.style.setProperty("--sidebar-border", palette.sidebarBorder);
  root.style.setProperty("--sidebar-funnel-border", palette.sidebarFunnelBorder);
  root.style.setProperty("--brand-accent", palette.accent);
  root.style.setProperty("--brand-accent-light", palette.accentLight);
  root.style.setProperty("--brand-accent-muted", palette.accentMuted);
}
