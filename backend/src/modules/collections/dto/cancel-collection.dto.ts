import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelCollectionDto {
  @ApiProperty({ description: 'Reason for cancellation', required: false })
  @IsString()
  @IsOptional()
  reason?: string;
}
