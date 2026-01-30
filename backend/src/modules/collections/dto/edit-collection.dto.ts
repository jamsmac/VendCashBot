import { IsNumber, IsString, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EditCollectionDto {
  @ApiProperty({ description: 'New amount in UZS' })
  @IsNumber()
  @Min(1, { message: 'Сумма должна быть больше 0' })
  @Max(1000000000, { message: 'Сумма не может превышать 1,000,000,000 сум' })
  amount: number;

  @ApiProperty({ description: 'Reason for edit' })
  @IsString()
  @MaxLength(500)
  reason: string;
}
