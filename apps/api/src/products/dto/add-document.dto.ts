import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ProductDocVisibility, ProductDocumentCategory, ProductDocumentType } from '@prisma/client';

export class AddDocumentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(ProductDocumentCategory)
  category?: ProductDocumentCategory;

  @IsOptional()
  @IsEnum(ProductDocumentType)
  type?: ProductDocumentType;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(ProductDocVisibility)
  visibility?: ProductDocVisibility;

  @IsOptional()
  @IsBoolean()
  aiExtractable?: boolean;

  @IsOptional()
  @IsString()
  versionLabel?: string;
}
