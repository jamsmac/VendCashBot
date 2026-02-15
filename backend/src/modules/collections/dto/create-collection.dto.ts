import { IsUUID, IsDate, IsOptional, IsString, IsBoolean, IsEnum, IsNumber, Min, Max, MaxLength, ValidateIf, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CollectionSource } from '../entities/collection.entity';

@ValidatorConstraint({ name: 'coordinatesPair', async: false })
class CoordinatesPairValidator implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as CreateCollectionDto;
    const hasLat = obj.latitude !== undefined && obj.latitude !== null;
    const hasLon = obj.longitude !== undefined && obj.longitude !== null;
    return hasLat === hasLon; // both present or both absent
  }

  defaultMessage(): string {
    return 'Both latitude and longitude must be provided together, or both omitted';
  }
}

export class CreateCollectionDto {
  @ApiProperty({ description: 'Machine ID' })
  @IsUUID()
  machineId: string;

  @ApiProperty({ description: 'Collection timestamp' })
  @Type(() => Date)
  @IsDate()
  collectedAt: Date;

  @ApiProperty({ description: 'Latitude', required: false })
  @ValidateIf((o) => o.latitude !== undefined || o.longitude !== undefined)
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Validate(CoordinatesPairValidator)
  @IsOptional()
  latitude?: number;

  @ApiProperty({ description: 'Longitude', required: false })
  @ValidateIf((o) => o.latitude !== undefined || o.longitude !== undefined)
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
