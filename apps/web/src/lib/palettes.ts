export type Palette = {
  key: string;
  label: string;
  sidebarBg: string;
  accent: string;
  accentLight: string;
  accentMuted: string;
  preview: string; // cor do dot de preview
};

export const PALETTES: Palette[] = [
  {
    key: "verde-via",
    label: "Verde VIA",
    sidebarBg: "#0D1B3E",
    accent: "#1D9E75",
    accentLight: "#5DCAA5",
    accentMuted: "rgba(29,158,117,0.18)",
    preview: "#1D9E75",
  },
  {
    key: "azul-royal",
    label: "Azul Royal",
    sidebarBg: "#0A1628",
    accent: "#2563EB",
    accentLight: "#60A5FA",
    accentMuted: "rgba(37,99,235,0.18)",
    preview: "#2563EB",
  },
  {
    key: "roxo-corporativo",
    label: "Roxo Corporativo",
    sidebarBg: "#16102A",
    accent: "#7C3AED",
    accentLight: "#A78BFA",
    accentMuted: "rgba(124,58,237,0.18)",
    preview: "#7C3AED",
  },
  {
    key: "grafite",
    label: "Grafite",
    sidebarBg: "#18181B",
    accent: "#71717A",
    accentLight: "#A1A1AA",
    accentMuted: "rgba(113,113,122,0.18)",
    preview: "#71717A",
  },
  {
    key: "bordô",
    label: "Bordô",
    sidebarBg: "#1A0A0F",
    accent: "#BE123C",
    accentLight: "#FB7185",
    accentMuted: "rgba(190,18,60,0.18)",
    preview: "#BE123C",
  },
  {
    key: "dourado",
    label: "Dourado",
    sidebarBg: "#1A1408",
    accent: "#B45309",
    accentLight: "#F59E0B",
    accentMuted: "rgba(180,83,9,0.18)",
    preview: "#B45309",
  },
];

export const DEFAULT_PALETTE = PALETTES[0];

export function getPalette(key?: string | null): Palette {
  return PALETTES.find((p) => p.key === key) ?? DEFAULT_PALETTE;
}

export function applyPalette(palette: Palette) {
  const root = document.documentElement;
  root.style.setProperty("--sidebar-bg", palette.sidebarBg);
  root.style.setProperty("--brand-accent", palette.accent);
  root.style.setProperty("--brand-accent-light", palette.accentLight);
  root.style.setProperty("--brand-accent-muted", palette.accentMuted);
}
