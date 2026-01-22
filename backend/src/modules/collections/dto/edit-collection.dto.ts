import { IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EditCollectionDto {
  @ApiProperty({ description: 'New amount in UZS' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: 'Reason for edit' })
  @IsString()
  reason: string;
}
