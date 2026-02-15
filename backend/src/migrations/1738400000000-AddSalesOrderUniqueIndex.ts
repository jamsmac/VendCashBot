import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSalesOrderUniqueIndex1738400000000 implements MigrationInterface {
  name = 'AddSalesOrderUniqueIndex1738400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Partial unique index: prevent duplicate orders when orderNumber is known.
    // PostgreSQL allows multiple NULLs in unique indexes, so orders without
    // order_number won't conflict. This covers >99% of real data.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_sales_order_dedup"
      ON "sales_orders" ("order_number", "machine_code", "order_date")
      WHERE "order_number" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_sales_order_dedup"`);
  }
}
