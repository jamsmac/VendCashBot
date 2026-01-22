import { IsString, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMachineDto {
  @ApiProperty({ description: 'Machine code (serial number)', required: false })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @ApiProperty({ description: 'Machine name', required: false })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiProperty({ description: 'Machine location', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  location?: string;

  @ApiProperty({ description: 'Is active', required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
