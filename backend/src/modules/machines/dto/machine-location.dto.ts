import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsBoolean,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class CreateMachineLocationDto {
  @IsString()
  @MaxLength(500)
  address: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsDateString()
  validFrom: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

export class UpdateMachineLocationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}
