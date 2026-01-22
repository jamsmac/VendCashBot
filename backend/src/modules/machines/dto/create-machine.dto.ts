import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
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
}
