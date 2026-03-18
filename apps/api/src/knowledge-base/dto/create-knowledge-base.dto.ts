import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum KnowledgeBaseAudienceDto {
  ATENDIMENTO = 'ATENDIMENTO',
  INTERNO = 'INTERNO',
  AMBOS = 'AMBOS',
}

export enum KnowledgeBaseTypeDto {
  PERSONALIDADE = 'PERSONALIDADE',
  FINANCIAMENTO = 'FINANCIAMENTO',
  PRODUTO = 'PRODUTO',
  REGRAS = 'REGRAS',
  MERCADO = 'MERCADO',
}

export class CreateKnowledgeBaseDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsEnum(KnowledgeBaseTypeDto)
  type!: KnowledgeBaseTypeDto;

  @IsString()
  prompt!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  links?: string[];

  @IsOptional()
  @IsString()
  whatAiUnderstood?: string;

  @IsOptional()
  @IsString()
  exampleOutput?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  tags?: string[];

  @IsOptional()
  @IsEnum(KnowledgeBaseAudienceDto)
  audience?: KnowledgeBaseAudienceDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}