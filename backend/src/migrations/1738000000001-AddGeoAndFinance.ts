import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGeoAndFinance1738000000001 implements MigrationInterface {
    name = 'AddGeoAndFinance1738000000001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Geo columns
        await queryRunner.query(`ALTER TABLE "machines" ADD COLUMN IF NOT EXISTS "latitude" decimal(10, 8)`);
        await queryRunner.query(`ALTER TABLE "machines" ADD COLUMN IF NOT EXISTS "longitude" decimal(11, 8)`);
        await queryRunner.query(`ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "latitude" decimal(10, 8)`);
        await queryRunner.query(`ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "longitude" decimal(11, 8)`);

        // Bank Deposits
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bank_deposits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "amount" decimal(15, 2) NOT NULL,
        "deposit_date" TIMESTAMP NOT NULL DEFAULT now(),
        "notes" text,
        "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY ("id")
      )
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "bank_deposits"`);
        await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN IF EXISTS "longitude"`);
        await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN IF EXISTS "latitude"`);
        await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN IF EXISTS "longitude"`);
        await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN IF EXISTS "latitude"`);
    }
}
