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
import {
  KnowledgeBaseAudienceDto,
  KnowledgeBaseTypeDto,
} from './create-knowledge-base.dto';

export class UpdateKnowledgeBaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsEnum(KnowledgeBaseTypeDto)
  type?: KnowledgeBaseTypeDto;

  @IsOptional()
  @IsString()
  prompt?: string;

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