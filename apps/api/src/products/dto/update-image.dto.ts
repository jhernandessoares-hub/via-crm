import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductImageLabel } from '@prisma/client';

export class UpdateImageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(ProductImageLabel)
  label?: ProductImageLabel;

  @IsOptional()
  @IsString()
  customLabel?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  publishSite?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  publishSocial?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPrimary?: boolean;
}
