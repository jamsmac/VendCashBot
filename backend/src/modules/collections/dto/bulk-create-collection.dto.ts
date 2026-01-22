import { IsArray, ValidateNested, IsOptional, IsString, IsNumber, IsUUID, IsEnum, IsDateString } from 'class-validator';
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
  @ValidateNested({ each: true })
  @Type(() => BulkCollectionItemDto)
  collections: BulkCollectionItemDto[];

  @ApiProperty({ enum: CollectionSource, required: false })
  @IsEnum(CollectionSource)
  @IsOptional()
  source?: CollectionSource;
}
