import { IsUUID, IsDate, IsOptional, IsString, IsBoolean, IsEnum, IsNumber, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CollectionSource } from '../entities/collection.entity';

export class CreateCollectionDto {
  @ApiProperty({ description: 'Machine ID' })
  @IsUUID()
  machineId: string;

  @ApiProperty({ description: 'Collection timestamp' })
  @Type(() => Date)
  @IsDate()
  collectedAt: Date;

  @ApiProperty({ description: 'Latitude', required: false })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @ApiProperty({ description: 'Longitude', required: false })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @ApiProperty({ description: 'Notes', required: false })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @ApiProperty({ enum: CollectionSource, required: false })
  @IsEnum(CollectionSource)
  @IsOptional()
  source?: CollectionSource;

  @ApiProperty({ description: 'Skip duplicate check', required: false })
  @IsBoolean()
  @IsOptional()
  skipDuplicateCheck?: boolean;
}
