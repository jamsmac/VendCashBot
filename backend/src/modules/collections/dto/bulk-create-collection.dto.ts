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
  @Min(1, { message: 'Сумма должна быть больше 0' })
  @Max(1000000000, { message: 'Сумма не может превышать 1,000,000,000 сум' })
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
  @ArrayMaxSize(1000, { message: 'Максимум 1000 инкассаций за один запрос' })
  @ValidateNested({ each: true })
  @Type(() => BulkCollectionItemDto)
  collections: BulkCollectionItemDto[];

  @ApiProperty({ enum: CollectionSource, required: false })
  @IsEnum(CollectionSource)
  @IsOptional()
  source?: CollectionSource;
}
