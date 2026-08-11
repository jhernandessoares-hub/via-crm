import { IsOptional, IsString } from 'class-validator';

export class ImportarExtratoDto {
  @IsString()
  bankAccountId!: string;

  // Vem como string no multipart/form-data ("true"/"false") — comparado como string no
  // service, mesmo padrão de incluirInativas=true nos GETs deste módulo.
  @IsOptional()
  @IsString()
  force?: string;
}

export class ConciliarDto {
  @IsOptional()
  @IsString()
  paymentId?: string;

  @IsOptional()
  @IsString()
  entryId?: string;
}

export class CriarLancamentoConciliacaoDto {
  @IsString()
  categoriaId!: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  contractId?: string;
}
