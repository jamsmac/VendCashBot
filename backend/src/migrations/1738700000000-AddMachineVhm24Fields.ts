import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMachineVhm24Fields1738700000000 implements MigrationInterface {
  name = 'AddMachineVhm24Fields1738700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add vhm24_id column if not exists
    const hasVhm24Id = await this.columnExists(queryRunner, 'machines', 'vhm24_id');
    if (!hasVhm24Id) {
      await queryRunner.query(
        `ALTER TABLE "machines" ADD COLUMN "vhm24_id" uuid DEFAULT NULL`,
      );
    }

    // Add vhm24_synced_at column if not exists
    const hasVhm24SyncedAt = await this.columnExists(queryRunner, 'machines', 'vhm24_synced_at');
    if (!hasVhm24SyncedAt) {
      await queryRunner.query(
        `ALTER TABLE "machines" ADD COLUMN "vhm24_synced_at" TIMESTAMP DEFAULT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN IF EXISTS "vhm24_synced_at"`);
    await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN IF EXISTS "vhm24_id"`);
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
}
