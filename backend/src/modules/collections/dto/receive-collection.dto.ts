import { IsNumber, IsOptional, IsString, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReceiveCollectionDto {
  @ApiProperty({ description: 'Amount in UZS', minimum: 0, maximum: 1000000000 })
  @IsNumber()
  @Min(0)
  @Max(1000000000)
  amount: number;

  @ApiProperty({ description: 'Notes', required: false })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
