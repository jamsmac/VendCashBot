import { IsNumber, IsString, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @ApiProperty({ description: 'Telegram user ID' })
  @IsNumber()
  telegramId: number;

  @ApiProperty({ description: 'Telegram username', required: false })
  @IsString()
  @IsOptional()
  telegramUsername?: string;

  @ApiProperty({ description: 'Telegram first name', required: false })
  @IsString()
  @IsOptional()
  telegramFirstName?: string;

  @ApiProperty({ description: 'User display name' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'Phone number', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ enum: UserRole, description: 'User role' })
  @IsEnum(UserRole)
  role: UserRole;
}
