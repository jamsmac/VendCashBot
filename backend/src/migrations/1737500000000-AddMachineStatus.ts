import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMachineStatus1737500000000 implements MigrationInterface {
  name = 'AddMachineStatus1737500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type if not exists
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "machine_status_enum" AS ENUM('pending', 'approved', 'rejected');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add status column with default 'approved' for existing records
    await queryRunner.query(`
      ALTER TABLE "machines"
      ADD COLUMN IF NOT EXISTS "status" "machine_status_enum" NOT NULL DEFAULT 'approved'
    `);

    // Add created_by_id column
    await queryRunner.query(`
      ALTER TABLE "machines"
      ADD COLUMN IF NOT EXISTS "created_by_id" uuid NULL
    `);

    // Add approved_by_id column
    await queryRunner.query(`
      ALTER TABLE "machines"
      ADD COLUMN IF NOT EXISTS "approved_by_id" uuid NULL
    `);

    // Add approved_at column
    await queryRunner.query(`
      ALTER TABLE "machines"
      ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP NULL
    `);

    // Add rejection_reason column
    await queryRunner.query(`
      ALTER TABLE "machines"
      ADD COLUMN IF NOT EXISTS "rejection_reason" VARCHAR(500) NULL
    `);

    // Add foreign key for created_by_id (if not exists)
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "machines"
        ADD CONSTRAINT "FK_machines_created_by"
        FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add foreign key for approved_by_id (if not exists)
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "machines"
        ADD CONSTRAINT "FK_machines_approved_by"
        FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create index for fast status lookup (if not exists)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_machines_status" ON "machines" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_machines_status"`);

    // Drop foreign keys
    await queryRunner.query(`ALTER TABLE "machines" DROP CONSTRAINT IF EXISTS "FK_machines_approved_by"`);
    await queryRunner.query(`ALTER TABLE "machines" DROP CONSTRAINT IF EXISTS "FK_machines_created_by"`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN IF EXISTS "rejection_reason"`);
    await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN IF EXISTS "approved_at"`);
    await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN IF EXISTS "approved_by_id"`);
    await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN IF EXISTS "created_by_id"`);
    await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN IF EXISTS "status"`);

    // Drop enum type
    await queryRunner.query(`DROP TYPE IF EXISTS "machine_status_enum"`);
  }
}
