import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMachineLocations1738100000000 implements MigrationInterface {
  name = 'AddMachineLocations1738100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create machine_locations table
    await queryRunner.query(`
      CREATE TABLE "machine_locations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "machine_id" uuid NOT NULL,
        "address" character varying(500) NOT NULL,
        "latitude" decimal(10,7),
        "longitude" decimal(10,7),
        "valid_from" date NOT NULL,
        "valid_to" date,
        "is_current" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_machine_locations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_machine_locations_machine" FOREIGN KEY ("machine_id")
          REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // Add location_id to collections for historical reference
    await queryRunner.query(`
      ALTER TABLE "collections" ADD COLUMN "location_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "collections" ADD CONSTRAINT "FK_collections_location"
        FOREIGN KEY ("location_id") REFERENCES "machine_locations"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_machine_locations_machine" ON "machine_locations" ("machine_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_machine_locations_current" ON "machine_locations" ("machine_id", "is_current")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_collections_location" ON "collections" ("location_id")
    `);

    // Migrate existing machine locations to machine_locations table
    await queryRunner.query(`
      INSERT INTO "machine_locations" ("machine_id", "address", "latitude", "longitude", "valid_from", "is_current")
      SELECT id, COALESCE(location, name), latitude, longitude, COALESCE(created_at::date, CURRENT_DATE), true
      FROM "machines"
      WHERE location IS NOT NULL OR latitude IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collections" DROP CONSTRAINT "FK_collections_location"`);
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN "location_id"`);
    await queryRunner.query(`DROP INDEX "IDX_collections_location"`);
    await queryRunner.query(`DROP INDEX "IDX_machine_locations_current"`);
    await queryRunner.query(`DROP INDEX "IDX_machine_locations_machine"`);
    await queryRunner.query(`DROP TABLE "machine_locations"`);
  }
}
