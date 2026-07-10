"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";

type ChangelogEntry = {
  version: string;
  date: string;
  changes: string[];
};

type VersionInfo = {
  version: string;
  commitSha: string | null;
  branch: string | null;
  changelog: ChangelogEntry[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export function VersionBadge({ collapsed = false }: { collapsed?: boolean }) {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!API_URL) return;
    fetch(`${API_URL}/version`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setInfo(data))
      .catch(() => {});
  }, []);

  if (!info) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ver mudanças desta versão"
        className="w-full text-xs font-medium transition-opacity hover:opacity-70"
        style={{ color: "var(--sidebar-text-muted)", textAlign: collapsed ? "center" : "left" }}
      >
        {collapsed ? "v" : `v${info.version}`}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Versão ${info.version}`}
        description={info.commitSha ? `Commit ${info.commitSha}${info.branch ? ` · ${info.branch}` : ""}` : undefined}
        size="md"
      >
        <div className="space-y-4">
          {info.changelog.map((entry) => (
            <div key={entry.version}>
              <div className="text-sm font-semibold" style={{ color: "var(--shell-text)" }}>
                v{entry.version} <span className="font-normal" style={{ color: "var(--shell-subtext)" }}>· {entry.date}</span>
              </div>
              <ul className="mt-1 list-disc pl-5 text-sm" style={{ color: "var(--shell-subtext)" }}>
                {entry.changes.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
