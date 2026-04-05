import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ProductCondition,
  ProductFurnished,
  ProductOrigin,
  ProductStandard,
  ProductStatus,
  ProductType,
} from '@prisma/client';

export class CreateProductDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsEnum(ProductOrigin)
  origin?: ProductOrigin;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  areaM2?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  tags?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  // ── Identificação ──────────────────────────
  @IsOptional()
  @IsString()
  referenceCode?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  // ── Endereço ───────────────────────────────
  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  streetNumber?: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsOptional()
  @IsString()
  condominiumName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsBoolean()
  hideAddress?: boolean;

  // ── Preços e taxas ─────────────────────────
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rentPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  iptu?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  condominiumFee?: number;

  @IsOptional()
  @IsBoolean()
  acceptsFinancing?: boolean;

  @IsOptional()
  @IsBoolean()
  acceptsDirectFinancing?: boolean;

  @IsOptional()
  @IsBoolean()
  acceptsExchange?: boolean;

  // ── Características físicas ────────────────
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  suites?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  parkingSpaces?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  builtAreaM2?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  privateAreaM2?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  landAreaM2?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalFloors?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  yearBuilt?: number;

  @IsOptional()
  @IsString()
  sunPosition?: string;

  // ── Comercialização ────────────────────────
  @IsOptional()
  @IsString()
  propertySituation?: string;

  @IsOptional()
  @IsBoolean()
  hasExclusivity?: boolean;

  @IsOptional()
  @IsString()
  exclusivityUntil?: string;

  @IsOptional()
  @IsString()
  virtualTourUrl?: string;

  // ── Diferenciais ───────────────────────────
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  internalFeatures?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  condoFeatures?: string[];

  @IsOptional()
  @IsEnum(ProductStandard)
  standard?: ProductStandard;

  @IsOptional()
  @IsEnum(ProductFurnished)
  furnished?: ProductFurnished;

  @IsOptional()
  @IsEnum(ProductCondition)
  condition?: ProductCondition;
}
