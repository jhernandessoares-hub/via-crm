import { FinEntryType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateRecorrenciaDto {
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
  companyId?: string;

  @IsNumber()
  valor!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimento?: number;

  @IsOptional()
  @IsBoolean()
  valorVariavel?: boolean;
}

export class UpdateRecorrenciaDto {
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
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsNumber()
  valor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimento?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsBoolean()
  valorVariavel?: boolean;
}

export class GerarValorVariavelDto {
  @IsNumber()
  valor!: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'competencia deve ser YYYY-MM' })
  competencia?: string;
}

export class UpsertMensalidadeDto {
  @IsNumber()
  valor!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimento?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  categoriaId?: string;
}

export class GerarCompetenciaDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'competencia deve ser YYYY-MM' })
  competencia?: string;
}
