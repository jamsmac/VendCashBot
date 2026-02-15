import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSalesOrders1738300000000 implements MigrationInterface {
  name = 'CreateSalesOrders1738300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`CREATE TYPE "payment_method_enum" AS ENUM('cash', 'card')`);
    await queryRunner.query(`CREATE TYPE "payment_status_enum" AS ENUM('paid', 'refunded')`);

    // Create table
    await queryRunner.query(`
      CREATE TABLE "sales_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_number" varchar(100),
        "product_name" varchar(255),
        "flavor" varchar(255),
        "payment_method" "payment_method_enum" NOT NULL,
        "payment_status" "payment_status_enum" NOT NULL DEFAULT 'paid',
        "machine_code" varchar(50) NOT NULL,
        "machine_id" uuid,
        "address" varchar(500),
        "price" decimal(15,2) NOT NULL DEFAULT 0,
        "order_date" TIMESTAMP NOT NULL,
        "import_batch_id" varchar(50) NOT NULL,
        "imported_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sales_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sales_orders_machine" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL
      )
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX "IDX_sales_orders_machine_code_date" ON "sales_orders" ("machine_code", "order_date")`);
    await queryRunner.query(`CREATE INDEX "IDX_sales_orders_payment_method_date" ON "sales_orders" ("payment_method", "order_date")`);
    await queryRunner.query(`CREATE INDEX "IDX_sales_orders_import_batch" ON "sales_orders" ("import_batch_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sales_orders"`);
    await queryRunner.query(`DROP TYPE "payment_method_enum"`);
    await queryRunner.query(`DROP TYPE "payment_status_enum"`);
  }
}
