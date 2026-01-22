import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReceiveCollectionDto {
  @ApiProperty({ description: 'Amount in UZS' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: 'Notes', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
