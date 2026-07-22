import { FinCategoryType, FinContactType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateCategoriaDto {
  @IsString()
  nome!: string;

  @IsEnum(FinCategoryType)
  tipo!: FinCategoryType;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsInt()
  ordem?: number;
}

export class UpdateCategoriaDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsInt()
  ordem?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class CreateContaBancariaDto {
  @IsString()
  nome!: string;

  @IsOptional()
  @IsString()
  banco?: string;

  @IsOptional()
  @IsString()
  agencia?: string;

  @IsOptional()
  @IsString()
  conta?: string;

  @IsOptional()
  @IsNumber()
  saldoInicial?: number;

  @Matches(DATE_RE, { message: 'saldoInicialData deve ser YYYY-MM-DD' })
  saldoInicialData!: string;

  @IsOptional()
  @IsString()
  companyId?: string;
}

export class UpdateContaBancariaDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  banco?: string;

  @IsOptional()
  @IsString()
  agencia?: string;

  @IsOptional()
  @IsString()
  conta?: string;

  @IsOptional()
  @IsNumber()
  saldoInicial?: number;

  @IsOptional()
  @Matches(DATE_RE, { message: 'saldoInicialData deve ser YYYY-MM-DD' })
  saldoInicialData?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  companyId?: string | null;
}

export class CreateEmpresaDto {
  @IsString()
  nome!: string;

  @IsOptional()
  @IsString()
  nomeFantasia?: string;

  @IsOptional()
  @IsString()
  cnpj?: string;
}

export class UpdateEmpresaDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  nomeFantasia?: string;

  @IsOptional()
  @IsString()
  cnpj?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class CreateContatoDto {
  @IsString()
  nome!: string;

  @IsOptional()
  @IsString()
  documento?: string;

  @IsOptional()
  @IsEnum(FinContactType)
  tipo?: FinContactType;

  @IsOptional()
  @IsString()
  observacao?: string;
}

export class UpdateContatoDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  documento?: string;

  @IsOptional()
  @IsEnum(FinContactType)
  tipo?: FinContactType;

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class DiaVencimentoMixin {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimento?: number;
}
