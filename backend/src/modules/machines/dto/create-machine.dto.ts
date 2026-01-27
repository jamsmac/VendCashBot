import { IsString, IsOptional, MinLength, MaxLength, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMachineDto {
  @ApiProperty({ description: 'Machine code (serial number)' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: 'Machine name' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'Machine location', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  location?: string;

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

  @ApiProperty({ description: 'Is machine active', required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
