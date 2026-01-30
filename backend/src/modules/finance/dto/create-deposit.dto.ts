import { IsNumber, IsString, IsOptional, IsDateString, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDepositDto {
  @ApiProperty({ description: 'Deposit amount in UZS', minimum: 0, maximum: 1000000000 })
  @IsNumber()
  @Min(0)
  @Max(1000000000, { message: 'Amount cannot exceed 1,000,000,000 UZS' })
  amount: number;

  @ApiProperty({ description: 'Deposit date (ISO string)' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'Notes', required: false })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
