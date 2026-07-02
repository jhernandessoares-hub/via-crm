import { FinEntryType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COMP_RE = /^\d{4}-\d{2}(-\d{2})?$/;

export class CreateLancamentoDto {
  @IsEnum(FinEntryType)
  tipo!: FinEntryType;

  @IsString()
  descricao!: string;

  @IsString()
  categoriaId!: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @Matches(COMP_RE, { message: 'competencia deve ser YYYY-MM' })
  competencia!: string;

  @Matches(DATE_RE, { message: 'vencimento deve ser YYYY-MM-DD' })
  vencimento!: string;

  @IsNumber()
  valor!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  parcelas?: number;

  @IsOptional()
  @IsString()
  observacao?: string;
}

export class UpdateLancamentoDto {
  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  categoriaId?: string;

  @IsOptional()
  @IsString()
  contactId?: string | null;

  @IsOptional()
  @Matches(COMP_RE, { message: 'competencia deve ser YYYY-MM' })
  competencia?: string;

  @IsOptional()
  @Matches(DATE_RE, { message: 'vencimento deve ser YYYY-MM-DD' })
  vencimento?: string;

  @IsOptional()
  @IsNumber()
  valor?: number;

  @IsOptional()
  @IsString()
  observacao?: string | null;
}

export class BaixarLancamentoDto {
  @IsString()
  bankAccountId!: string;

  @Matches(DATE_RE, { message: 'dataPagamento deve ser YYYY-MM-DD' })
  dataPagamento!: string;

  @IsNumber()
  valor!: number;

  @IsOptional()
  @IsString()
  observacao?: string;
}
