import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateUserModules1738500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_modules',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'module',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'granted_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'granted_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Unique constraint: user can have each module only once
    await queryRunner.createIndex(
      'user_modules',
      new TableIndex({
        name: 'UQ_user_modules_user_module',
        columnNames: ['user_id', 'module'],
        isUnique: true,
      }),
    );

    // Index for fast lookup by user_id
    await queryRunner.createIndex(
      'user_modules',
      new TableIndex({
        name: 'IDX_user_modules_user_id',
        columnNames: ['user_id'],
      }),
    );

    // Foreign key to users table
    await queryRunner.createForeignKey(
      'user_modules',
      new TableForeignKey({
        name: 'FK_user_modules_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_modules');
  }
}
