import { BadRequestException } from '@nestjs/common';

export const TIPO_LABEL: Record<string, string> = {
  DUVIDA: 'Dúvida',
  DENUNCIA: 'Denúncia',
  RECLAMACAO: 'Reclamação',
  SUGESTAO: 'Sugestão',
  ACOLHIMENTO: 'Acolhimento',
  SOLICITACAO: 'Solicitação',
  ELOGIO: 'Elogio',
  OUTRO: 'Outro',
};
export const TIPOS_VALIDOS = Object.keys(TIPO_LABEL);
export const LOCAIS_VALIDOS = ['PLANTAO', 'ONLINE', 'OUTRO'];

export function validarTipo(tipo: unknown): string {
  if (typeof tipo !== 'string' || !TIPOS_VALIDOS.includes(tipo)) {
    throw new BadRequestException(`tipo é obrigatório e deve ser um de: ${TIPOS_VALIDOS.join(', ')}.`);
  }
  return tipo;
}

export function validarLocal(local: unknown): string | null {
  if (local == null || local === '') return null;
  if (typeof local !== 'string' || !LOCAIS_VALIDOS.includes(local)) {
    throw new BadRequestException(`local deve ser um de: ${LOCAIS_VALIDOS.join(', ')}.`);
  }
  return local;
}
