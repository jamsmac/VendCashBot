import { ApiProperty } from '@nestjs/swagger';

export class ImportSalesResultDto {
  @ApiProperty()
  imported: number;

  @ApiProperty()
  skipped: number;

  @ApiProperty({ description: 'Количество дубликатов, пропущенных при импорте' })
  duplicates: number;

  @ApiProperty()
  errors: string[];

  @ApiProperty()
  batchId: string;

  @ApiProperty()
  machinesFound: number;

  @ApiProperty()
  machinesNotFound: string[];
}
