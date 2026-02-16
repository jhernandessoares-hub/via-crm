import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ManagerDecisionType } from '@prisma/client';

export class ManagerDecisionDto {
  @IsEnum(ManagerDecisionType)
  decision!: ManagerDecisionType;

  @IsString()
  reasonId!: string;

  @IsOptional()
  @IsString()
  justification?: string;
}
