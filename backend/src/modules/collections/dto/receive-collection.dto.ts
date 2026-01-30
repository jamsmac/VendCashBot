import { IsNumber, IsOptional, IsString, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReceiveCollectionDto {
  @ApiProperty({ description: 'Amount in UZS', minimum: 1, maximum: 1000000000 })
  @IsNumber()
  @Min(1, { message: 'Сумма должна быть больше 0' })
  @Max(1000000000)
  amount: number;

  @ApiProperty({ description: 'Notes', required: false })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
