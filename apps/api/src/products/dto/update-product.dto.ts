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
  DealType,
  ProductCondition,
  ProductFurnished,
  ProductKind,
  ProductOrigin,
  ProductPublicationStatus,
  ProductRegistrationStatus,
  ProductStandard,
  ProductStatus,
  ProductType,
} from '@prisma/client';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  title?: string;

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
  @IsEnum(DealType)
  dealType?: DealType;

  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;

  @IsOptional()
  @IsEnum(ProductPublicationStatus)
  publicationStatus?: ProductPublicationStatus;

  @IsOptional()
  @IsEnum(ProductRegistrationStatus)
  registrationStatus?: ProductRegistrationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number | null;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  neighborhood?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bedrooms?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bathrooms?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  areaM2?: number | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  tags?: string | null;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  // ── Identificação ──────────────────────────
  @IsOptional()
  @IsString()
  referenceCode?: string | null;

  @IsOptional()
  @IsString()
  registrationNumber?: string | null;

  // ── Endereço ───────────────────────────────
  @IsOptional()
  @IsString()
  state?: string | null;

  @IsOptional()
  @IsString()
  zipCode?: string | null;

  @IsOptional()
  @IsString()
  street?: string | null;

  @IsOptional()
  @IsString()
  streetNumber?: string | null;

  @IsOptional()
  @IsString()
  complement?: string | null;

  @IsOptional()
  @IsString()
  referencePoint?: string | null;

  @IsOptional()
  @IsString()
  condominiumName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number | null;

  @IsOptional()
  @IsBoolean()
  hideAddress?: boolean;

  // ── Preços e taxas ─────────────────────────
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rentPrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  iptu?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  condominiumFee?: number | null;

  @IsOptional()
  @IsBoolean()
  acceptsFinancing?: boolean;

  @IsOptional()
  @IsBoolean()
  acceptsExchange?: boolean;

  // ── Características físicas ────────────────
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  suites?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  parkingSpaces?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  builtAreaM2?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  privateAreaM2?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  landAreaM2?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floor?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalFloors?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  yearBuilt?: number | null;

  @IsOptional()
  @IsString()
  sunPosition?: string | null;

  // ── Especificações das unidades ──────────────
  @IsOptional()
  @IsArray()
  unitSpecs?: any[];

  // ── Comercialização ────────────────────────
  @IsOptional()
  @IsString()
  propertySituation?: string | null;

  @IsOptional()
  @IsBoolean()
  hasExclusivity?: boolean;

  @IsOptional()
  @IsString()
  exclusivityUntil?: string | null;

  @IsOptional()
  @IsString()
  virtualTourUrl?: string | null;

  @IsOptional()
  @IsArray()
  visitLocations?: any[];

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
  standard?: ProductStandard | null;

  @IsOptional()
  @IsEnum(ProductFurnished)
  furnished?: ProductFurnished | null;

  @IsOptional()
  @IsEnum(ProductCondition)
  condition?: ProductCondition | null;

  // ── Empreendimento / Loteamento ─────────────
  @IsOptional()
  @IsString()
  developer?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalUnits?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalTowers?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  floorsPerTower?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  privateAreaMinM2?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  privateAreaMaxM2?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  parkingMin?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  parkingMax?: number | null;

  @IsOptional()
  @IsString()
  deliveryForecast?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  buyerIncomeLimit?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minBuyerIncome?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  socialPrograms?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unitTypes?: string[];

  @IsOptional()
  @IsString()
  technicalDescription?: string | null;

  @IsOptional()
  @IsString()
  commercialDescription?: string | null;

  @IsOptional()
  aiGeneratedFields?: Record<string, boolean> | null;

  // ── Valores e Condições ─────────────────────
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceReviewDays?: number | null;

  @IsOptional()
  @IsBoolean()
  acceptsFGTS?: boolean;

  @IsOptional()
  @IsBoolean()
  acceptsTradeIn?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tradeInTypes?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minEntryValue?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  installmentEntryMonths?: number | null;

  @IsOptional()
  @IsString()
  paymentConditions?: string | null;
}
