import { IsUUID, IsDate, IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
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

  @ApiProperty({ description: 'Notes', required: false })
  @IsString()
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
