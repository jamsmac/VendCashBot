import { IsArray, ValidateNested, IsOptional, IsString, IsNumber, IsUUID, IsEnum, IsDateString, Min, ArrayMaxSize } from 'class-validator';
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
  @IsOptional()
  machineCode?: string;

  @ApiProperty({ description: 'Collection timestamp' })
  @IsDateString()
  collectedAt: string;

  @ApiProperty({ description: 'Amount in UZS', required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;

  @ApiProperty({ description: 'Notes', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
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
