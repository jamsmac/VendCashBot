import { IsNumber, IsString, IsNotEmpty, IsOptional, Min, Max, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class EditCollectionDto {
  @ApiProperty({ description: 'Новая сумма в UZS', minimum: 1, maximum: 1000000000, required: false })
  @IsNumber({}, { message: 'Сумма должна быть числом' })
  @IsOptional()
  @Min(1, { message: 'Сумма должна быть больше 0' })
  @Max(1000000000, { message: 'Сумма не может превышать 1,000,000,000 сум' })
  amount?: number;

  @ApiProperty({ description: 'Причина изменения' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().replace(/<[^>]*>/g, '') : value)
  @IsString({ message: 'Причина должна быть строкой' })
  @IsNotEmpty({ message: 'Укажите причину изменения' })
  @MaxLength(500, { message: 'Причина не может превышать 500 символов' })
  reason: string;

  @ApiProperty({ description: 'Примечания', required: false })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().replace(/<[^>]*>/g, '') : value)
  @IsString({ message: 'Примечание должно быть строкой' })
  @IsOptional()
  @MaxLength(1000, { message: 'Примечание не может превышать 1000 символов' })
  notes?: string;
}
