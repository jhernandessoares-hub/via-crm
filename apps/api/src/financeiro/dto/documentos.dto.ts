import { FinDocumentType, FinEntryType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Multipart: campos chegam como string — números são convertidos no service
export class UploadDocumentoDto {
  @IsEnum(FinDocumentType)
  tipo!: FinDocumentType;

  @IsOptional()
  @IsString()
  numero?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  valor?: string;

  @IsOptional()
  @Matches(DATE_RE, { message: 'dataEmissao deve ser YYYY-MM-DD' })
  dataEmissao?: string;

  @IsOptional()
  @IsString()
  contactId?: string;
}

export class UpdateDocumentoDto {
  @IsOptional()
  @IsEnum(FinDocumentType)
  tipo?: FinDocumentType;

  @IsOptional()
  @IsString()
  numero?: string | null;

  @IsOptional()
  @IsString()
  descricao?: string | null;

  @IsOptional()
  @IsNumber()
  valor?: number | null;

  @IsOptional()
  @Matches(DATE_RE, { message: 'dataEmissao deve ser YYYY-MM-DD' })
  dataEmissao?: string | null;

  @IsOptional()
  @IsString()
  contactId?: string | null;
}

export class JaPagoDto {
  @IsString()
  bankAccountId!: string;

  @Matches(DATE_RE, { message: 'dataPagamento deve ser YYYY-MM-DD' })
  dataPagamento!: string;
}

export class GerarLancamentosDto {
  @IsEnum(FinEntryType)
  tipo!: FinEntryType;

  @IsString()
  categoriaId!: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, { message: 'competencia deve ser YYYY-MM' })
  competencia?: string;

  @Matches(DATE_RE, { message: 'vencimento deve ser YYYY-MM-DD' })
  vencimento!: string;

  @IsOptional()
  @IsNumber()
  valor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  parcelas?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => JaPagoDto)
  jaPago?: JaPagoDto;
}
