import { IsOptional, IsUUID, IsEnum, IsDateString, IsNumber, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CollectionStatus, CollectionSource } from '../entities/collection.entity';

export class CollectionQueryDto {
  @ApiProperty({ enum: CollectionStatus, required: false })
  @IsEnum(CollectionStatus)
  @IsOptional()
  status?: CollectionStatus;

  @ApiProperty({ description: 'Machine ID', required: false })
  @IsUUID()
  @IsOptional()
  machineId?: string;

  @ApiProperty({ description: 'Operator ID', required: false })
  @IsUUID()
  @IsOptional()
  operatorId?: string;

  @ApiProperty({ enum: CollectionSource, required: false })
  @IsEnum(CollectionSource)
  @IsOptional()
  source?: CollectionSource;

  @ApiProperty({ description: 'From date', required: false })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiProperty({ description: 'To date', required: false })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiProperty({ description: 'Sort by field', required: false })
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiProperty({ description: 'Sort order', required: false })
  @IsString()
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC';

  @ApiProperty({
    description: 'Page number (starts from 1)',
    required: false,
    minimum: 1,
    default: 1,
    example: 1,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiProperty({
    description: 'Items per page (max 100)',
    required: false,
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
