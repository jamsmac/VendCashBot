import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateImportFiles1738450000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'import_files',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'batch_id',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'original_name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'telegram_file_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'telegram_message_id',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'file_size',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'import_files',
      new TableIndex({
        name: 'UQ_import_files_batch_id',
        columnNames: ['batch_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('import_files');
  }
}
