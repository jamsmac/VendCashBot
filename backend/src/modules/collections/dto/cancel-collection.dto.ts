import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelCollectionDto {
  @ApiProperty({ description: 'Reason for cancellation', required: false })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}
