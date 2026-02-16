import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminGGV77V1738800000000 implements MigrationInterface {
  name = 'AddAdminGGV77V1738800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if user with this telegram_id already exists
    const existing = await queryRunner.query(
      `SELECT id FROM "users" WHERE telegram_id = 7945645995`,
    );

    if (existing.length === 0) {
      await queryRunner.query(
        `INSERT INTO "users" (id, telegram_id, telegram_username, name, role, is_active, created_at, updated_at)
         VALUES (uuid_generate_v4(), 7945645995, 'GGV77V', 'GGV77V', 'admin', true, NOW(), NOW())`,
      );
    } else {
      // If user exists but not admin, upgrade to admin
      await queryRunner.query(
        `UPDATE "users" SET role = 'admin', is_active = true, updated_at = NOW()
         WHERE telegram_id = 7945645995`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "users" WHERE telegram_id = 7945645995`,
    );
  }
}
