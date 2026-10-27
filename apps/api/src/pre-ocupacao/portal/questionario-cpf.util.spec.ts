import { conferirCpfDaFamilia, pessoaDoCpf } from './questionario-cpf.util';

describe('CPF de quem responde o questionário', () => {
  const lead = {
    cpf: '111.444.777-35',
    nome: 'MARIA',
    nomeCorreto: 'Maria Souza',
    telefone: '5511999990000',
    participantes: [
      { cpf: '529.982.247-25', nome: 'João Souza', telefone: '5511988880000' },
      { cpf: null, nome: 'Incorporado sem CPF', telefone: '5511977770000' },
    ],
  };

  it('acha a pessoa do cadastro dona do CPF', () => {
    expect(pessoaDoCpf(lead, '11144477735')).toEqual({ nome: 'Maria Souza', telefone: '5511999990000' });
    expect(pessoaDoCpf(lead, '52998224725')).toEqual({ nome: 'João Souza', telefone: '5511988880000' });
    expect(pessoaDoCpf(lead, '00000000000')).toBeNull();
    expect(pessoaDoCpf(lead, '')).toBeNull();
  });

  it('ninguém começou: vale qualquer CPF do cadastro', () => {
    expect(conferirCpfDaFamilia(lead, '52998224725', null)).toBe('OK');
    expect(conferirCpfDaFamilia(lead, '11144477735', null)).toBe('OK');
    expect(conferirCpfDaFamilia(lead, '12345678909', null)).toBe('NAO_CADASTRADO');
  });

  it('alguém começou: só continua com o mesmo CPF', () => {
    expect(conferirCpfDaFamilia(lead, '52998224725', '529.982.247-25')).toBe('OK');
    expect(conferirCpfDaFamilia(lead, '11144477735', '529.982.247-25')).toBe('OUTRA_PESSOA');
    expect(conferirCpfDaFamilia(lead, '12345678909', '529.982.247-25')).toBe('NAO_CADASTRADO');
  });

  it('CPF de quem começou saiu do cadastro: não trava a família', () => {
    expect(conferirCpfDaFamilia(lead, '11144477735', '98765432100')).toBe('OK');
  });
});
