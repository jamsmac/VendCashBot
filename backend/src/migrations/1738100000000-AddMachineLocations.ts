import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMachineLocations1738100000000 implements MigrationInterface {
  name = 'AddMachineLocations1738100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create machine_locations table (idempotent)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "machine_locations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "machine_id" uuid NOT NULL,
        "address" character varying(500) NOT NULL,
        "latitude" decimal(10,7),
        "longitude" decimal(10,7),
        "valid_from" date NOT NULL,
        "valid_to" date,
        "is_current" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_machine_locations" PRIMARY KEY ("id")
      )
    `);

    // Add foreign key constraint if not exists
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "machine_locations" ADD CONSTRAINT "FK_machine_locations_machine"
          FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add location_id to collections for historical reference (idempotent)
    await queryRunner.query(`
      ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "location_id" uuid
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "collections" ADD CONSTRAINT "FK_collections_location"
          FOREIGN KEY ("location_id") REFERENCES "machine_locations"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create indexes (idempotent)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_machine_locations_machine" ON "machine_locations" ("machine_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_machine_locations_current" ON "machine_locations" ("machine_id", "is_current")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_collections_location" ON "collections" ("location_id")
    `);

    // Migrate existing machine locations to machine_locations table (only if empty)
    await queryRunner.query(`
      INSERT INTO "machine_locations" ("machine_id", "address", "latitude", "longitude", "valid_from", "is_current")
      SELECT id, COALESCE(location, name), latitude, longitude, COALESCE(created_at::date, CURRENT_DATE), true
      FROM "machines"
      WHERE (location IS NOT NULL OR latitude IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM "machine_locations" LIMIT 1)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collections" DROP CONSTRAINT IF EXISTS "FK_collections_location"`);
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN IF EXISTS "location_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_collections_location"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_machine_locations_current"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_machine_locations_machine"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "machine_locations"`);
  }
}
