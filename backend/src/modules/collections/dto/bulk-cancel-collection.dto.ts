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
import { ApiProperty } from '@nestjs/swagger';
import { CollectionStatus, CollectionSource } from '../entities/collection.entity';

export class BulkCancelCollectionDto {
  @ApiProperty({
    description: 'Array of collection IDs to cancel',
    required: false,
  })
  @ValidateIf((o) => !o.useFilters)
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one collection ID is required' })
  @ArrayMaxSize(500, { message: 'Maximum 500 collections per request' })
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
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}
