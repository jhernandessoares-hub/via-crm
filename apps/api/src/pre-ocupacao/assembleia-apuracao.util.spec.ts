import { apurarItem, opcoesDoItem, quorumInstalacao, OPCOES_APROVACAO } from './assembleia-apuracao.util';

const aprov = (quorum: any) => ({ tipo: 'APROVACAO' as const, quorum, opcoes: OPCOES_APROVACAO });
const rep = (opcao: string, n: number) => Array(n).fill(opcao);

describe('quorumInstalacao', () => {
  const segunda = new Date('2026-12-01T19:30:00Z');
  it('1ª convocação exige maioria das unidades', () => {
    expect(quorumInstalacao(258, 129, new Date('2026-12-01T19:00:00Z'), segunda).instalada).toBe(false);
    expect(quorumInstalacao(258, 130, new Date('2026-12-01T19:00:00Z'), segunda).instalada).toBe(true);
  });
  it('2ª convocação instala com qualquer número', () => {
    expect(quorumInstalacao(258, 3, segunda, segunda).instalada).toBe(true);
  });
});

describe('apurarItem', () => {
  it('maioria dos presentes: abstenção não conta como voto válido', () => {
    const r = apurarItem(aprov('MAIORIA_PRESENTES'), [...rep('Sim', 10), ...rep('Não', 8), ...rep('Abstenção', 5)], 258, 23);
    expect(r.votosValidos).toBe(18);
    expect(r.necessarios).toBe(10);
    expect(r.aprovado).toBe(true);
  });

  it('2/3 conta sobre todas as unidades, não só os presentes', () => {
    const r = apurarItem(aprov('DOIS_TERCOS'), rep('Sim', 150), 258, 150);
    expect(r.necessarios).toBe(172);
    expect(r.aprovado).toBe(false);
    expect(apurarItem(aprov('DOIS_TERCOS'), rep('Sim', 172), 258, 172).aprovado).toBe(true);
  });

  it('empate na eleição não elege ninguém', () => {
    const item = { tipo: 'ELEICAO' as const, quorum: 'MAIORIA_PRESENTES' as const, opcoes: opcoesDoItem('ELEICAO', ['Ana', 'Bruno']) };
    const r = apurarItem(item, [...rep('Ana', 5), ...rep('Bruno', 5)], 258, 10);
    expect(r.empate).toBe(true);
    expect(r.vencedor).toBeNull();
    expect(r.aprovado).toBe(false);
  });

  it('eleição: mais votado vence com maioria dos votos válidos', () => {
    const item = { tipo: 'ELEICAO' as const, quorum: 'MAIORIA_PRESENTES' as const, opcoes: opcoesDoItem('ELEICAO', ['Ana', 'Bruno']) };
    const r = apurarItem(item, [...rep('Ana', 7), ...rep('Bruno', 3), 'Abstenção'], 258, 11);
    expect(r.vencedor).toBe('Ana');
    expect(r.aprovado).toBe(true);
  });

  it('opcoesDoItem sempre inclui Abstenção', () => {
    expect(opcoesDoItem('ESCOLHA', ['A', ' ', 'B'])).toEqual(['A', 'B', 'Abstenção']);
  });
});
