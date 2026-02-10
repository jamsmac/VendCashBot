import { IsOptional, IsUUID, IsEnum, IsDateString, IsNumber, Min, Max, IsString, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CollectionStatus, CollectionSource } from '../entities/collection.entity';

@ValidatorConstraint({ name: 'isDateRangeValid', async: false })
class IsDateRangeValidConstraint implements ValidatorConstraintInterface {
  validate(_value: string, args: ValidationArguments) {
    const obj = args.object as any;
    if (!obj.from || !obj.to) return true;
    return new Date(obj.from) <= new Date(obj.to);
  }
  defaultMessage() {
    return 'Дата "от" должна быть раньше или равна дате "до"';
  }
}

export class CollectionQueryDto {
  @ApiProperty({ enum: CollectionStatus, required: false })
  @IsEnum(CollectionStatus)
  @IsOptional()
  status?: CollectionStatus;

  @ApiProperty({ description: 'ID автомата', required: false })
  @IsUUID()
  @IsOptional()
  machineId?: string;

  @ApiProperty({ description: 'ID оператора', required: false })
  @IsUUID()
  @IsOptional()
  operatorId?: string;

  @ApiProperty({ enum: CollectionSource, required: false })
  @IsEnum(CollectionSource)
  @IsOptional()
  source?: CollectionSource;

  @ApiProperty({ description: 'Дата от', required: false })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiProperty({ description: 'Дата до', required: false })
  @IsDateString()
  @IsOptional()
  @Validate(IsDateRangeValidConstraint)
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
