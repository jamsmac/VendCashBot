import { IsArray, ValidateNested, IsOptional, IsString, IsNumber, IsUUID, IsEnum, IsDateString, Min, Max, MaxLength, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CollectionSource } from '../entities/collection.entity';

class BulkCollectionItemDto {
  @ApiProperty({ description: 'Machine ID', required: false })
  @IsUUID()
  @IsOptional()
  machineId?: string;

  @ApiProperty({ description: 'Machine code', required: false })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  machineCode?: string;

  @ApiProperty({ description: 'Collection timestamp' })
  @IsDateString()
  collectedAt: string;

  @ApiProperty({ description: 'Amount in UZS', required: false })
  @IsNumber()
  @Min(0)
  @Max(1000000000, { message: 'Amount cannot exceed 1,000,000,000 UZS' })
  @IsOptional()
  amount?: number;

  @ApiProperty({ description: 'Notes', required: false })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @ApiProperty({ description: 'Machine location ID (for historical address)', required: false })
  @IsUUID()
  @IsOptional()
  locationId?: string;
}

export class BulkCreateCollectionDto {
  @ApiProperty({ type: [BulkCollectionItemDto] })
  @IsArray()
  @ArrayMaxSize(1000, { message: 'Maximum 1000 collections per request' })
  @ValidateNested({ each: true })
  @Type(() => BulkCollectionItemDto)
  collections: BulkCollectionItemDto[];

  @ApiProperty({ enum: CollectionSource, required: false })
  @IsEnum(CollectionSource)
  @IsOptional()
  source?: CollectionSource;
}
