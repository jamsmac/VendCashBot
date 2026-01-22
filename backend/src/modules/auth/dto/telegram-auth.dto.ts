import { IsNumber, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TelegramAuthDto {
  @ApiProperty({ description: 'Telegram user ID' })
  @IsNumber()
  id: number;

  @ApiProperty({ description: 'First name', required: false })
  @IsString()
  @IsOptional()
  first_name?: string;

  @ApiProperty({ description: 'Last name', required: false })
  @IsString()
  @IsOptional()
  last_name?: string;

  @ApiProperty({ description: 'Telegram username', required: false })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiProperty({ description: 'Photo URL', required: false })
  @IsString()
  @IsOptional()
  photo_url?: string;

  @ApiProperty({ description: 'Auth date timestamp' })
  @IsNumber()
  auth_date: number;

  @ApiProperty({ description: 'Hash for verification' })
  @IsString()
  hash: string;
}
