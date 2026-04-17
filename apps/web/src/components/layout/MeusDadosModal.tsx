"use client";

import { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Role = "OWNER" | "MANAGER" | "AGENT";

export type FullProfile = {
  id: string;
  nome: string;
  email: string;
  apelido: string | null;
  preferences: { theme?: "light" | "dark" } | null;
  role: Role;
  branchId: string | null;
  tenant: { nome: string };
};

function applyTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  if (theme === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}

interface Props {
  profile: FullProfile;
  onClose: () => void;
  onSaved: (updated: Partial<FullProfile>) => void;
}

export function MeusDadosModal({ profile, onClose, onSaved }: Props) {
  const [nome, setNome] = useState(profile.nome);
  const [email, setEmail] = useState(profile.email);
  const [apelido, setApelido] = useState(profile.apelido ?? "");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(
    profile.preferences?.theme ?? "light"
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);

    if (novaSenha && novaSenha !== confirmarSenha) {
      setErr("A nova senha e a confirmação não coincidem.");
      return;
    }
    if (novaSenha && novaSenha.length < 6) {
      setErr("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        nome,
        email,
        apelido: apelido.trim() || null,
        preferences: { theme },
      };
      if (novaSenha) {
        body.senhaAtual = senhaAtual;
        body.novaSenha = novaSenha;
      }
      await apiFetch("/users/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      applyTheme(theme);
      setOk(true);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
      onSaved({
        nome,
        email,
        apelido: apelido.trim() || null,
        preferences: { theme },
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Meus Dados" size="md">
      <form onSubmit={handleSave} className="space-y-4">
        <Input
          label="Nome completo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
        />
        <Input
          label="Apelido"
          hint="Exibido no topo (opcional)"
          value={apelido}
          onChange={(e) => setApelido(e.target.value)}
          placeholder="Ex: João"
        />
        <Input
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {/* Trocar senha */}
        <div
          className="rounded-lg border p-3 space-y-3"
          style={{ borderColor: "var(--shell-card-border)" }}
        >
          <p
            className="text-xs font-medium"
            style={{ color: "var(--shell-subtext)" }}
          >
            Trocar senha{" "}
            <span className="font-normal opacity-70">
              (deixe em branco para manter)
            </span>
          </p>
          <Input
            type="password"
            placeholder="Senha atual"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            autoComplete="current-password"
          />
          <Input
            type="password"
            placeholder="Nova senha (mín. 6 caracteres)"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            autoComplete="new-password"
          />
          <Input
            type="password"
            placeholder="Confirmar nova senha"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        {/* Tema */}
        <div>
          <label
            className="block text-xs font-medium mb-2"
            style={{ color: "var(--shell-subtext)" }}
          >
            Tema do sistema
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className="flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors"
              style={
                theme === "light"
                  ? {
                      borderColor: "#1D9E75",
                      background: "#E6F7F1",
                      color: "#1D9E75",
                    }
                  : {
                      borderColor: "var(--shell-card-border)",
                      color: "var(--shell-text)",
                      background: "transparent",
                    }
              }
            >
              <Sun className="h-4 w-4" /> Claro
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className="flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors"
              style={
                theme === "dark"
                  ? {
                      borderColor: "#1D9E75",
                      background: "#E6F7F1",
                      color: "#1D9E75",
                    }
                  : {
                      borderColor: "var(--shell-card-border)",
                      color: "var(--shell-text)",
                      background: "transparent",
                    }
              }
            >
              <Moon className="h-4 w-4" /> Escuro
            </button>
          </div>
        </div>

        {err && (
          <p
            className="text-sm rounded-md px-3 py-2"
            style={{
              color: "#EF4444",
              background: "rgba(239,68,68,0.08)",
            }}
          >
            {err}
          </p>
        )}
        {ok && (
          <p
            className="text-sm rounded-md px-3 py-2"
            style={{ color: "#1D9E75", background: "#E6F7F1" }}
          >
            Dados salvos com sucesso!
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button type="submit" loading={loading} className="flex-1">
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
