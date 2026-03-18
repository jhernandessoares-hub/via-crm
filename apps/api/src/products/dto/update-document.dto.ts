import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ProductDocVisibility, ProductDocumentCategory, ProductDocumentType } from '@prisma/client';

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsEnum(ProductDocumentCategory)
  category?: ProductDocumentCategory;

  @IsOptional()
  @IsEnum(ProductDocumentType)
  type?: ProductDocumentType;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsEnum(ProductDocVisibility)
  visibility?: ProductDocVisibility;

  @IsOptional()
  @IsBoolean()
  aiExtractable?: boolean;

  @IsOptional()
  @IsString()
  versionLabel?: string | null;
}
