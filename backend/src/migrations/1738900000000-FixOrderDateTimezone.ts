import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix timezone mismatch in sales_orders.order_date.
 *
 * Problem:
 *   ExcelJS parses Excel dates treating the time component as UTC.
 *   But the vending machine software records dates in Tashkent time (UTC+5).
 *   So order_date "16:34" in the DB actually means 16:34 Tashkent = 11:34 UTC.
 *
 *   Meanwhile, collected_at (from Telegram bot) uses new Date() → real UTC.
 *
 *   Reconciliation SQL compares order_date with collected_at directly,
 *   causing a 5-hour mismatch and incorrect expected amounts.
 *
 * Fix:
 *   Subtract 5 hours from all existing order_date values to convert
 *   from "Tashkent-as-UTC" to real UTC.
 *   Also fix parseDate() in sales.service.ts for future imports.
 */
export class FixOrderDateTimezone1738900000000 implements MigrationInterface {
  name = 'FixOrderDateTimezone1738900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Convert all order_date from Tashkent-as-UTC to real UTC
    const result = await queryRunner.query(`
      UPDATE sales_orders
      SET order_date = order_date - INTERVAL '5 hours'
    `);

    console.log(`[Migration] FixOrderDateTimezone: updated ${result?.[1] ?? '?'} rows`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse: add 5 hours back
    await queryRunner.query(`
      UPDATE sales_orders
      SET order_date = order_date + INTERVAL '5 hours'
    `);
  }
}
