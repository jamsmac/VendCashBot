import { IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReportQueryDto {
  @ApiProperty({ description: 'From date (YYYY-MM-DD)', required: false })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiProperty({ description: 'To date (YYYY-MM-DD)', required: false })
  @IsDateString()
  @IsOptional()
  to?: string;
}
