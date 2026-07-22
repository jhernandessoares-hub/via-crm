import { FinEntryType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateContratoDto {
  @IsOptional()
  @IsString()
  numero?: string;

  @IsString()
  descricao!: string;

  @IsEnum(FinEntryType)
  tipo!: FinEntryType;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  categoriaId?: string;

  @IsOptional()
  @IsNumber()
  valorTotal?: number;

  @IsOptional()
  @IsNumber()
  valorRecorrente?: number;

  @IsOptional()
  @Matches(DATE_RE, { message: 'dataInicio deve ser YYYY-MM-DD' })
  dataInicio?: string;

  @IsOptional()
  @Matches(DATE_RE, { message: 'dataFim deve ser YYYY-MM-DD' })
  dataFim?: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}

export class UpdateContratoDto {
  @IsOptional()
  @IsString()
  numero?: string | null;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  contactId?: string | null;

  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsString()
  categoriaId?: string | null;

  @IsOptional()
  @IsNumber()
  valorTotal?: number | null;

  @IsOptional()
  @IsNumber()
  valorRecorrente?: number | null;

  @IsOptional()
  @Matches(DATE_RE, { message: 'dataInicio deve ser YYYY-MM-DD' })
  dataInicio?: string | null;

  @IsOptional()
  @Matches(DATE_RE, { message: 'dataFim deve ser YYYY-MM-DD' })
  dataFim?: string | null;

  @IsOptional()
  @IsString()
  observacao?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class RenovarContratoDto {
  @Matches(DATE_RE, { message: 'dataInicio deve ser YYYY-MM-DD' })
  dataInicio!: string;

  @Matches(DATE_RE, { message: 'dataFim deve ser YYYY-MM-DD' })
  dataFim!: string;
}
