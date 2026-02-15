import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDistanceFromMachine1738200000000 implements MigrationInterface {
  name = 'AddDistanceFromMachine1738200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "collections" ADD COLUMN "distance_from_machine" decimal(10, 2) DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "collections" DROP COLUMN "distance_from_machine"`,
    );
  }
}
