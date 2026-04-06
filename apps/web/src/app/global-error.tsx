"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
          <div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Algo deu errado</h2>
            <p style={{ marginTop: "0.5rem", color: "#6b7280" }}>
              <button onClick={() => reset()} style={{ color: "#059669", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                Tentar novamente
              </button>
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
