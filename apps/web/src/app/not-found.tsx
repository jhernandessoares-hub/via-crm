export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 600 }}>404 — Página não encontrada</h2>
        <p style={{ marginTop: "0.5rem", color: "#6b7280" }}>
          <a href="/" style={{ color: "#059669" }}>Voltar ao início</a>
        </p>
      </div>
    </div>
  );
}
