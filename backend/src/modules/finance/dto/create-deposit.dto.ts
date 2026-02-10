import { IsNumber, IsString, IsOptional, IsDateString, Min, Max, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDepositDto {
  @ApiProperty({ description: 'Сумма депозита в UZS', minimum: 1, maximum: 1000000000 })
  @IsNumber({}, { message: 'Сумма должна быть числом' })
  @Min(1, { message: 'Сумма банковского депозита должна быть больше 0' })
  @Max(1000000000, { message: 'Сумма не может превышать 1,000,000,000 сум' })
  amount: number;

  @ApiProperty({ description: 'Дата депозита (ISO строка)' })
  @IsDateString({}, { message: 'Укажите корректную дату' })
  date: string;

  @ApiProperty({ description: 'Примечание', required: false })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().replace(/<[^>]*>/g, '') : value)
  @IsString()
  @MaxLength(1000, { message: 'Примечание не может превышать 1000 символов' })
  @IsOptional()
  notes?: string;
}
