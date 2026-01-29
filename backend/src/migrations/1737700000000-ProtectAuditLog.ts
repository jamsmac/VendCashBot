import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProtectAuditLog1737700000000 implements MigrationInterface {
  name = 'ProtectAuditLog1737700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create function to prevent audit log modifications (CREATE OR REPLACE is idempotent)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_modification()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Audit log records cannot be modified or deleted';
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Drop trigger if exists, then create (to make idempotent)
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS prevent_audit_update ON collection_history
    `);

    await queryRunner.query(`
      CREATE TRIGGER prevent_audit_update
      BEFORE UPDATE OR DELETE ON collection_history
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS prevent_audit_update ON collection_history`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS prevent_audit_modification`,
    );
  }
}
