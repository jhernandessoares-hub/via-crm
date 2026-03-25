import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReplaceTeachingDto {
  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  leadMessage?: string;

  @IsString()
  approvedResponse!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
