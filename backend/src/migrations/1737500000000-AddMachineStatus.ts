import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMachineStatus1737500000000 implements MigrationInterface {
  name = 'AddMachineStatus1737500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type
    await queryRunner.query(`
      CREATE TYPE "machine_status_enum" AS ENUM('pending', 'approved', 'rejected')
    `);

    // Add status column with default 'approved' for existing records
    await queryRunner.query(`
      ALTER TABLE "machines"
      ADD COLUMN "status" "machine_status_enum" NOT NULL DEFAULT 'approved'
    `);

    // Add created_by_id column
    await queryRunner.query(`
      ALTER TABLE "machines"
      ADD COLUMN "created_by_id" uuid NULL
    `);

    // Add approved_by_id column
    await queryRunner.query(`
      ALTER TABLE "machines"
      ADD COLUMN "approved_by_id" uuid NULL
    `);

    // Add approved_at column
    await queryRunner.query(`
      ALTER TABLE "machines"
      ADD COLUMN "approved_at" TIMESTAMP NULL
    `);

    // Add rejection_reason column
    await queryRunner.query(`
      ALTER TABLE "machines"
      ADD COLUMN "rejection_reason" VARCHAR(500) NULL
    `);

    // Add foreign key for created_by_id
    await queryRunner.query(`
      ALTER TABLE "machines"
      ADD CONSTRAINT "FK_machines_created_by"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // Add foreign key for approved_by_id
    await queryRunner.query(`
      ALTER TABLE "machines"
      ADD CONSTRAINT "FK_machines_approved_by"
      FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // Create index for fast status lookup
    await queryRunner.query(`
      CREATE INDEX "IDX_machines_status" ON "machines" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`DROP INDEX "IDX_machines_status"`);

    // Drop foreign keys
    await queryRunner.query(`ALTER TABLE "machines" DROP CONSTRAINT "FK_machines_approved_by"`);
    await queryRunner.query(`ALTER TABLE "machines" DROP CONSTRAINT "FK_machines_created_by"`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN "rejection_reason"`);
    await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN "approved_at"`);
    await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN "approved_by_id"`);
    await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN "created_by_id"`);
    await queryRunner.query(`ALTER TABLE "machines" DROP COLUMN "status"`);

    // Drop enum type
    await queryRunner.query(`DROP TYPE "machine_status_enum"`);
  }
}
