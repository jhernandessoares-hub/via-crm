import {
  PlanejamentoTtsAtividadeStatus,
  PlanejamentoTtsEntregaveisStatus,
  PlanejamentoTtsIndicadorSituacao,
  PlanejamentoTtsNfStatus,
  PlanejamentoTtsPagamentoStatus,
} from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateAtividadeDto {
  @IsOptional()
  @IsEnum(PlanejamentoTtsAtividadeStatus)
  status?: PlanejamentoTtsAtividadeStatus;

  @IsOptional()
  @Matches(DATE_RE, { message: 'prazoLimite deve ser YYYY-MM-DD' })
  prazoLimite?: string;

  @IsOptional()
  @IsString()
  responsavel?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class UpdateParcelaDto {
  @IsOptional()
  @IsEnum(PlanejamentoTtsEntregaveisStatus)
  entregaveisStatus?: PlanejamentoTtsEntregaveisStatus;

  @IsOptional()
  @IsEnum(PlanejamentoTtsNfStatus)
  nfStatus?: PlanejamentoTtsNfStatus;

  @IsOptional()
  @IsEnum(PlanejamentoTtsPagamentoStatus)
  pagamentoStatus?: PlanejamentoTtsPagamentoStatus;

  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class UpdateIndicadorDto {
  @IsOptional()
  @IsEnum(PlanejamentoTtsIndicadorSituacao)
  situacao?: PlanejamentoTtsIndicadorSituacao;

  @IsOptional()
  @IsString()
  evidencias?: string;
}
