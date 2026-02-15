import { IsString, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// BE-L03: "At least one field" validation is enforced at the controller level
// because class-validator's @IsOptional() skips validators on undefined fields.

export class UpdateUserDto {
  @ApiProperty({ description: 'User display name', required: false })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @ApiProperty({ description: 'Telegram username', required: false })
  @IsString()
  @IsOptional()
  telegramUsername?: string;

  @ApiProperty({ description: 'Telegram first name', required: false })
  @IsString()
  @IsOptional()
  telegramFirstName?: string;

  @ApiProperty({ description: 'Phone number', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: 'Is active', required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
