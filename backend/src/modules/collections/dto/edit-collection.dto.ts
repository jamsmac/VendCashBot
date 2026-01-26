import { IsNumber, IsString, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EditCollectionDto {
  @ApiProperty({ description: 'New amount in UZS' })
  @IsNumber()
  @Min(0)
  @Max(1000000000, { message: 'Amount cannot exceed 1,000,000,000 UZS' })
  amount: number;

  @ApiProperty({ description: 'Reason for edit' })
  @IsString()
  reason: string;
}
