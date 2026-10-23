import { registrarAvisoEntregaQuestionario } from './questionario-entrega.util';

type Envio = {
  id: string;
  waMessageId: string;
  entregueEm: Date | null;
  statusEnvio: string;
  entregaErro: string | null;
  ultimoEnvioErro?: string | null;
  linkAbertoEm: Date | null;
  respondidoEm: Date | null;
};

function prismaFalso(envios: Envio[]) {
  const eventos: { envioId: string; tipo: string }[] = [];
  const prisma: any = {
    preOcupacaoQuestionarioEnvio: {
      findMany: async ({ where }: any) => envios.filter((e) => e.waMessageId === where.waMessageId),
      update: async ({ where, data }: any) => Object.assign(envios.find((e) => e.id === where.id)!, data),
    },
    preOcupacaoQuestionarioEnvioEvento: {
      create: async ({ data }: any) => eventos.push(data),
    },
  };
  return { prisma, eventos };
}

const envio = (over: Partial<Envio> = {}): Envio => ({
  id: 'e1',
  waMessageId: 'MSG1',
  entregueEm: null,
  statusEnvio: 'ENVIADO',
  entregaErro: null,
  linkAbertoEm: null,
  respondidoEm: null,
  ...over,
});

describe('aviso de entrega do WhatsApp no questionário', () => {
  it('entregue grava entregueEm e o evento ENTREGUE (uma vez só)', async () => {
    const e = envio();
    const { prisma, eventos } = prismaFalso([e]);
    await registrarAvisoEntregaQuestionario(prisma, 'MSG1', 'ENTREGUE');
    await registrarAvisoEntregaQuestionario(prisma, 'MSG1', 'ENTREGUE'); // "lido" depois do "entregue"
    expect(e.entregueEm).toBeInstanceOf(Date);
    expect(eventos.map((x) => x.tipo)).toEqual(['ENTREGUE']);
  });

  it('erro marca FALHA só se a família não abriu o link', async () => {
    const naoAbriu = envio();
    const abriu = envio({ id: 'e2', linkAbertoEm: new Date() });
    const { prisma } = prismaFalso([naoAbriu, abriu]);
    await registrarAvisoEntregaQuestionario(prisma, 'MSG1', 'ERRO', '463');
    expect(naoAbriu.statusEnvio).toBe('FALHA');
    expect(naoAbriu.entregaErro).toContain('463');
    expect(abriu.statusEnvio).toBe('ENVIADO');
  });

  it('entrega depois de um erro desfaz a falha', async () => {
    const e = envio();
    const { prisma } = prismaFalso([e]);
    await registrarAvisoEntregaQuestionario(prisma, 'MSG1', 'ERRO');
    await registrarAvisoEntregaQuestionario(prisma, 'MSG1', 'ENTREGUE');
    expect(e.statusEnvio).toBe('ENVIADO');
    expect(e.entregaErro).toBeNull();
    expect(e.entregueEm).toBeInstanceOf(Date);
  });

  it('mensagem que não é de questionário não faz nada e nunca lança', async () => {
    const { prisma, eventos } = prismaFalso([envio()]);
    await registrarAvisoEntregaQuestionario(prisma, 'OUTRA', 'ENTREGUE');
    expect(eventos).toHaveLength(0);
    prisma.preOcupacaoQuestionarioEnvio.findMany = async () => {
      throw new Error('banco fora');
    };
    await expect(registrarAvisoEntregaQuestionario(prisma, 'MSG1', 'ENTREGUE')).resolves.toBeUndefined();
  });
});
