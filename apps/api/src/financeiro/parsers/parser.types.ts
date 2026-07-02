export interface ParsedTransaction {
  /** "YYYY-MM-DD" */
  data: string;
  /** Com sinal: negativo = débito/saída */
  valor: number;
  descricao: string;
  /** FITID do OFX, quando presente — chave preferencial de deduplicação */
  fitId?: string;
}
