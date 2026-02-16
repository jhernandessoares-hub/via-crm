'use client';

import { useEffect, useMemo, useState } from 'react';

type Reason = {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
};

type Lead = {
  id: string;
  nome: string;
  telefone?: string | null;
  telefoneKey?: string | null;
  origem?: string | null;
  status: string;
  needsManagerReview: boolean;
  queuePriority: number;
  lastInboundAt?: string | null;
  events?: any[];
};

const DECISIONS = [
  { value: 'KEEP_AGENT_REENTRY', label: 'Manter corretor e reentrada (sobe na fila)' },
  { value: 'AI_ROUTE_OTHER_IF_AVAILABLE_AFTER_QUALIFICATION', label: 'Ativar IA e rotear outro se houver (após qualificação)' },
  { value: 'KEEP_CLOSED', label: 'Manter fechado sem novo atendimento' },
  { value: 'AI_ROUTE_ANY_AFTER_QUALIFICATION', label: 'Ativar IA e rotear qualquer corretor (após qualificação)' },
] as const;

export default function ManagerQueuePage() {
  const API_BASE =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';

  const [token, setToken] = useState('');
  const [tokenOk, setTokenOk] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [reasons, setReasons] = useState<Reason[]>([]);
  const [queue, setQueue] = useState<Lead[]>([]);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [decision, setDecision] = useState<(typeof DECISIONS)[number]['value']>('KEEP_AGENT_REENTRY');
  const [reasonId, setReasonId] = useState<string>('');
  const [justification, setJustification] = useState<string>('');
  const selectedLead = useMemo(
    () => queue.find((l) => l.id === selectedLeadId) || null,
    [queue, selectedLeadId],
  );

  // tenta pegar token do localStorage
  useEffect(() => {
    try {
      const t = localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
      if (t) {
        setToken(t);
        setTokenOk(true);
      }
    } catch {}
  }, []);

  async function api(path: string, init?: RequestInit) {
    const headers: Record<string, string> = {
      ...(init?.headers as any),
      'Content-Type': 'application/json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText} - ${txt}`);
    }
    // pode ser [] ou {}
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return null;
  }

  async function loadAll() {
    setErr(null);
    setLoading(true);
    try {
      const [r, q] = await Promise.all([
        api('/config/manager-reasons'),
        api('/leads/manager-queue'),
      ]);
      const rr: Reason[] = Array.isArray(r) ? r : [];
      rr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setReasons(rr);
      setQueue(Array.isArray(q) ? q : []);
      if (rr.length && !reasonId) setReasonId(rr[0].id);
    } catch (e: any) {
      setErr(e?.message || 'Erro');
    } finally {
      setLoading(false);
    }
  }

  async function submitDecision() {
    if (!selectedLeadId) return;
    if (!reasonId) {
      alert('Selecione um motivo');
      return;
    }

    setErr(null);
    setLoading(true);
    try {
      await api(`/leads/${selectedLeadId}/manager-decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reasonId,
          justification: justification?.trim() || null,
        }),
      });

      // limpa e recarrega fila
      setSelectedLeadId(null);
      setJustification('');
      await loadAll();
      alert('Decisão registrada ✅');
    } catch (e: any) {
      setErr(e?.message || 'Erro ao enviar decisão');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: 'Arial, sans-serif' }}>
      <h2>Fila do Manager (simples)</h2>

      <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600 }}>Token:</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Cole o Bearer token aqui (sem 'Bearer ')"
            style={{ width: 520, padding: 8 }}
          />
          <button
            onClick={() => {
              setTokenOk(!!token.trim());
              try {
                localStorage.setItem('accessToken', token.trim());
              } catch {}
              loadAll();
            }}
            style={{ padding: '8px 12px' }}
          >
            Usar token e carregar
          </button>
          <button onClick={loadAll} style={{ padding: '8px 12px' }} disabled={!tokenOk && !token.trim()}>
            Recarregar
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          Dica: se você já logou no navegador e salvou token no localStorage, ele pode preencher sozinho.
        </div>
      </div>

      {err ? (
        <div style={{ background: '#ffe8e8', border: '1px solid #ffb3b3', padding: 10, borderRadius: 8, marginBottom: 12 }}>
          <b>Erro:</b> <span>{err}</span>
        </div>
      ) : null}

      {loading ? <div>Carregando...</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* LISTA */}
        <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
          <h3>Leads na fila ({queue.length})</h3>

          {queue.length === 0 ? <div>Nenhum lead em needsManagerReview=true</div> : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {queue.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelectedLeadId(l.id)}
                style={{
                  textAlign: 'left',
                  padding: 10,
                  borderRadius: 8,
                  border: selectedLeadId === l.id ? '2px solid #333' : '1px solid #ccc',
                  background: selectedLeadId === l.id ? '#f3f3f3' : 'white',
                  cursor: 'pointer',
                }}
              >
                <div><b>{l.nome}</b> — {l.origem || '(sem origem)'}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  telefoneKey: {l.telefoneKey || '-'} | status: {l.status} | priority: {l.queuePriority}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* DECISÃO */}
        <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
          <h3>Decisão</h3>

          {!selectedLead ? (
            <div>Selecione um lead na lista.</div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <div><b>Lead:</b> {selectedLead.nome}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  id: {selectedLead.id}<br />
                  origem: {selectedLead.origem || '-'}<br />
                  telefoneKey: {selectedLead.telefoneKey || '-'}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Motivo</div>
                  <select
                    value={reasonId}
                    onChange={(e) => setReasonId(e.target.value)}
                    style={{ padding: 8, width: '100%' }}
                  >
                    {reasons.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.sortOrder}. {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Decisão</div>
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value as any)}
                    style={{ padding: 8, width: '100%' }}
                  >
                    {DECISIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Justificativa (opcional)</div>
                  <textarea
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    rows={4}
                    style={{ width: '100%', padding: 8 }}
                    placeholder="Opcional..."
                  />
                </div>

                <button
                  onClick={submitDecision}
                  style={{ padding: '10px 12px', fontWeight: 700 }}
                  disabled={loading}
                >
                  Confirmar decisão
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
