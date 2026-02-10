import {
  IsArray,
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
  ArrayMinSize,
  ValidateIf,
  IsEnum,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CollectionStatus, CollectionSource } from '../entities/collection.entity';

export class BulkCancelCollectionDto {
  @ApiProperty({
    description: 'Array of collection IDs to cancel',
    required: false,
  })
  @ValidateIf((o) => !o.useFilters)
  @IsArray()
  @ArrayMinSize(1, { message: 'Укажите хотя бы один ID инкассации' })
  @ArrayMaxSize(500, { message: 'Максимум 500 инкассаций за один запрос' })
  @IsUUID('4', { each: true })
  ids?: string[];

  @ApiProperty({
    description: 'When true, cancel all matching filter criteria instead of IDs',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  useFilters?: boolean;

  @ApiProperty({ enum: CollectionStatus, required: false })
  @ValidateIf((o) => o.useFilters)
  @IsEnum(CollectionStatus)
  @IsOptional()
  status?: CollectionStatus;

  @ApiProperty({ required: false })
  @ValidateIf((o) => o.useFilters)
  @IsUUID()
  @IsOptional()
  machineId?: string;

  @ApiProperty({ required: false })
  @ValidateIf((o) => o.useFilters)
  @IsUUID()
  @IsOptional()
  operatorId?: string;

  @ApiProperty({ enum: CollectionSource, required: false })
  @ValidateIf((o) => o.useFilters)
  @IsEnum(CollectionSource)
  @IsOptional()
  source?: CollectionSource;

  @ApiProperty({ required: false })
  @ValidateIf((o) => o.useFilters)
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiProperty({ required: false })
  @ValidateIf((o) => o.useFilters)
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiProperty({ description: 'Reason for bulk cancellation', required: false })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().replace(/<[^>]*>/g, '') : value)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}
