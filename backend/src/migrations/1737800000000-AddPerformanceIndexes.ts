import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1737800000000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1737800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Collections indexes for common queries
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_collections_status ON collections(status)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_collections_machine_date ON collections(machine_id, collected_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_collections_operator ON collections(operator_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_collections_collected_at ON collections(collected_at DESC)`,
    );

    // Users index for Telegram ID lookups
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id)`,
    );

    // Collection history index for audit log queries
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_history_collection ON collection_history(collection_id)`,
    );

    // Invites index for code lookups
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code)`,
    );

    // Machines index for code lookups
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_machines_code ON machines(code)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collections_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collections_machine_date`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collections_operator`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collections_collected_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_telegram`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_history_collection`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_invites_code`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_machines_code`);
  }
}
