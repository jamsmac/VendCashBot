import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserDeactivationAndSettings1738600000000 implements MigrationInterface {
  name = 'AddUserDeactivationAndSettings1738600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add deactivation columns to users table (IF NOT EXISTS for safety)
    const hasDeactivatedAt = await this.columnExists(queryRunner, 'users', 'deactivated_at');
    if (!hasDeactivatedAt) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD COLUMN "deactivated_at" TIMESTAMP DEFAULT NULL`,
      );
    }

    const hasDeactivatedBy = await this.columnExists(queryRunner, 'users', 'deactivated_by');
    if (!hasDeactivatedBy) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD COLUMN "deactivated_by" varchar(255) DEFAULT NULL`,
      );
    }

    const hasDeactivationReason = await this.columnExists(queryRunner, 'users', 'deactivation_reason');
    if (!hasDeactivationReason) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD COLUMN "deactivation_reason" text DEFAULT NULL`,
      );
    }

    // 2. Create settings table if not exists
    const hasSettingsTable = await this.tableExists(queryRunner, 'settings');
    if (!hasSettingsTable) {
      await queryRunner.query(`
        CREATE TABLE "settings" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "key" varchar(100) NOT NULL,
          "value" text,
          "description" text,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_settings" PRIMARY KEY ("id"),
          CONSTRAINT "UQ_settings_key" UNIQUE ("key")
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deactivation_reason"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deactivated_by"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deactivated_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "settings"`);
  }

  private async columnExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column],
    );
    return result.length > 0;
  }

  private async tableExists(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public'`,
      [table],
    );
    return result.length > 0;
  }
}
