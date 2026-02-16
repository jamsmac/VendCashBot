import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { SalesOrder, PaymentMethod, PaymentStatus } from './entities/sales-order.entity';
import { ImportFile } from './entities/import-file.entity';
import { Machine } from '../machines/entities/machine.entity';
import { Collection, CollectionStatus } from '../collections/entities/collection.entity';
import { SalesQueryDto, ReconciliationQueryDto } from './dto/sales-query.dto';
import { ImportSalesResultDto } from './dto/import-sales.dto';
import { TelegramService } from '../../telegram/telegram.service';
import { v4 as uuidv4 } from 'uuid';
import {
  startOfDayTashkent,
  endOfDayTashkent,
  PG_TASHKENT_TZ,
} from '../../common/utils/timezone';

/** Map Excel payment resource text to our enum */
function parsePaymentMethod(value: string): PaymentMethod | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  if (lower.includes('наличн')) return PaymentMethod.CASH;
  // "Таможенный платеж" and similar non-cash methods
  if (lower.includes('таможен') || lower.includes('карт') || lower.includes('qr')) return PaymentMethod.CARD;
  // send, vip, test — skip (not relevant for reconciliation)
  return null;
}

function parsePaymentStatus(value: string): PaymentStatus {
  if (!value) return PaymentStatus.PAID;
  const lower = value.trim().toLowerCase();
  if (lower.includes('возвращ') || lower.includes('refund')) return PaymentStatus.REFUNDED;
  return PaymentStatus.PAID;
}

function parsePrice(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

/**
 * Check if a date string contains time information (is a full timestamp).
 * "2025-01-30" → false (date only)
 * "2025-01-30T13:40:00.000Z" → true (full timestamp)
 * "2025-01-30 13:40:00" → true (full timestamp)
 */
function isFullTimestamp(dateStr: string): boolean {
  return dateStr.includes('T') || /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(dateStr);
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const str = String(value).trim();
  // Format: "2025-09-11 23:06:09"
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Column mapping detected from header row.
 * Maps semantic field names to 1-based column indices.
 */
interface ColumnMap {
  orderNumber: number;
  product: number;
  flavor: number;
  paymentResource: number;
  paymentStatus: number;
  machineCode: number;
  address: number;
  price: number;
  orderDate: number;
}

/** Default column positions matching the 2026-format files */
const DEFAULT_COLUMNS: ColumnMap = {
  orderNumber: 1,   // A
  product: 3,       // C
  flavor: 4,        // D
  paymentResource: 5, // E
  paymentStatus: 7,  // G
  machineCode: 9,   // I
  address: 10,      // J
  price: 11,        // K
  orderDate: 13,    // M
};

/**
 * Header patterns for auto-detecting column positions.
 * Each key has an array of possible header substrings (lowercase).
 */
const HEADER_PATTERNS: Record<keyof ColumnMap, string[]> = {
  orderNumber: ['номер заказ', '№ заказ', 'order number', 'order_number', 'номер', 'заказ №'],
  product: ['продукт', 'товар', 'product', 'напиток', 'наименование'],
  flavor: ['вкус', 'flavor', 'добавка'],
  paymentResource: ['ресурс оплат', 'оплат', 'payment resource', 'способ оплат', 'метод оплат', 'тип оплат'],
  paymentStatus: ['статус оплат', 'payment status', 'статус платеж'],
  machineCode: ['код автомат', 'код аппарат', 'machine code', 'машин', 'автомат', 'аппарат', 'код устройства'],
  address: ['адрес', 'address', 'расположение', 'локация'],
  price: ['цена', 'сумма', 'стоимость', 'price', 'amount'],
  orderDate: ['дата заказ', 'дата продаж', 'order date', 'дата', 'date'],
};

/**
 * Detect column mapping from the header row.
 * Falls back to DEFAULT_COLUMNS if headers can't be detected.
 */
function detectColumns(headerRow: ExcelJS.Row, logger: Logger): ColumnMap {
  const cols: Partial<ColumnMap> = {};
  const headerValues: Record<number, string> = {};

  // Read all header cell values
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const val = String(cell.value || '').trim().toLowerCase();
    if (val) headerValues[colNumber] = val;
  });

  // For each field, find the best matching column
  for (const [field, patterns] of Object.entries(HEADER_PATTERNS)) {
    for (const [colNum, headerVal] of Object.entries(headerValues)) {
      for (const pattern of patterns) {
        if (headerVal.includes(pattern)) {
          cols[field as keyof ColumnMap] = parseInt(colNum);
          break;
        }
      }
      if (cols[field as keyof ColumnMap]) break;
    }
  }

  // Check if we found the critical columns
  const critical: (keyof ColumnMap)[] = ['paymentResource', 'machineCode', 'price', 'orderDate'];
  const missing = critical.filter((f) => !cols[f]);

  if (missing.length > 0) {
    logger.warn(
      `Column auto-detection: missing critical columns [${missing.join(', ')}]. ` +
      `Detected: ${JSON.stringify(cols)}. Headers: ${JSON.stringify(headerValues)}. ` +
      `Falling back to default column positions.`,
    );
    return DEFAULT_COLUMNS;
  }

  // Fill non-critical missing fields from defaults
  const result: ColumnMap = { ...DEFAULT_COLUMNS };
  for (const [key, value] of Object.entries(cols)) {
    if (value !== undefined) {
      result[key as keyof ColumnMap] = value;
    }
  }

  logger.log(`Column auto-detection successful: ${JSON.stringify(result)}`);
  return result;
}

export interface ReconciliationItem {
  machineCode: string;
  machineName: string;
  periodStart: string;
  periodEnd: string;
  expectedAmount: number; // cash sales from orders
  actualAmount: number;   // collection amount
  difference: number;     // expected - actual
  percentDeviation: number;
  status: 'matched' | 'shortage' | 'overage' | 'no_sales';
  cashOrdersCount: number;
  collectionId: string;
}

export interface ReconciliationResult {
  items: ReconciliationItem[];
  summary: {
    totalExpected: number;
    totalActual: number;
    totalDifference: number;
    matchedCount: number;
    shortageCount: number;
    overageCount: number;
    noSalesCount: number;
  };
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(ImportFile)
    private readonly importFileRepository: Repository<ImportFile>,
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
    @InjectRepository(Collection)
    private readonly collectionRepository: Repository<Collection>,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * Import Excel file with orders.
   * Parses columns: A=orderNumber, C=product, D=flavor, E=paymentResource, G=paymentStatus,
   * I=machineCode, J=address, K=price, M=orderDate
   *
   * Duplicate protection: uses ON CONFLICT DO NOTHING on the partial unique
   * index (order_number, machine_code, order_date) WHERE order_number IS NOT NULL.
   * Orders already present in the DB are silently skipped and counted as duplicates.
   */
  async importExcel(fileBuffer: Buffer, originalName?: string): Promise<ImportSalesResultDto> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('Excel файл не содержит листов');
    }

    // Detect column mapping from header row
    const headerRow = worksheet.getRow(1);
    const cols = detectColumns(headerRow, this.logger);

    // Log first few header values for debugging
    const headerPreview: Record<number, string> = {};
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headerPreview[colNumber] = String(cell.value || '').trim();
    });
    this.logger.log(`Import file: "${originalName}", headers: ${JSON.stringify(headerPreview)}`);
    this.logger.log(`Using column map: ${JSON.stringify(cols)}`);

    // Build machine code → id lookup
    const machines = await this.machineRepository.find();
    const machineMap = new Map<string, string>();
    machines.forEach((m) => {
      machineMap.set(m.code.toLowerCase(), m.id);
    });

    const batchId = uuidv4().substring(0, 8);
    const orders: Partial<SalesOrder>[] = [];
    const errors: string[] = [];
    let skipped = 0;
    let skippedPayment = 0;
    let skippedMachineCode = 0;
    const machineCodesNotFound = new Set<string>();
    const machineCodesFound = new Set<string>();

    // Skip header row (row 1)
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      try {
        const paymentResource = String(row.getCell(cols.paymentResource).value || '').trim();
        const paymentMethod = parsePaymentMethod(paymentResource);
        if (!paymentMethod) {
          skipped++;
          skippedPayment++;
          // Log first few skips for debugging
          if (skippedPayment <= 3) {
            this.logger.debug(
              `Row ${rowNumber} skipped: paymentResource="${paymentResource}" (col ${cols.paymentResource}) not recognized`,
            );
          }
          return; // Skip non-cash/card (send, vip, test)
        }

        const machineCode = String(row.getCell(cols.machineCode).value || '').trim();
        if (!machineCode) {
          skipped++;
          skippedMachineCode++;
          if (skippedMachineCode <= 3) {
            this.logger.debug(
              `Row ${rowNumber} skipped: empty machineCode (col ${cols.machineCode})`,
            );
          }
          return;
        }

        const price = parsePrice(row.getCell(cols.price).value);
        const orderDate = parseDate(row.getCell(cols.orderDate).value);
        if (!orderDate) {
          errors.push(`Строка ${rowNumber}: невозможно распознать дату`);
          return;
        }

        const machineId = machineMap.get(machineCode.toLowerCase()) || null;
        if (machineId) {
          machineCodesFound.add(machineCode.toLowerCase());
        } else {
          machineCodesNotFound.add(machineCode);
        }

        orders.push({
          orderNumber: String(row.getCell(cols.orderNumber).value || '').trim() || undefined,
          productName: String(row.getCell(cols.product).value || '').trim() || undefined,
          flavor: String(row.getCell(cols.flavor).value || '').trim() || undefined,
          paymentMethod,
          paymentStatus: parsePaymentStatus(String(row.getCell(cols.paymentStatus).value || '')),
          machineCode,
          machineId: machineId || undefined,
          address: String(row.getCell(cols.address).value || '').trim() || undefined,
          price,
          orderDate,
          importBatchId: batchId,
        });
      } catch (err) {
        errors.push(`Строка ${rowNumber}: ${err instanceof Error ? err.message : 'ошибка парсинга'}`);
      }
    });

    // Batch insert with duplicate protection (chunks of 500)
    // orIgnore() → ON CONFLICT DO NOTHING — silently skips duplicates
    let imported = 0;
    let duplicates = 0;
    const chunkSize = 500;
    for (let i = 0; i < orders.length; i += chunkSize) {
      const chunk = orders.slice(i, i + chunkSize);
      const result = await this.salesOrderRepository
        .createQueryBuilder()
        .insert()
        .into(SalesOrder)
        .values(chunk)
        .orIgnore()
        .execute();
      // result.identifiers contains only actually inserted rows
      const actuallyInserted = result.identifiers.filter((id) => id?.id).length;
      imported += actuallyInserted;
      duplicates += chunk.length - actuallyInserted;
    }

    this.logger.log(
      `Sales import complete: ${imported} imported, ${duplicates} duplicates, ${skipped} skipped ` +
      `(payment: ${skippedPayment}, machineCode: ${skippedMachineCode}), ` +
      `${errors.length} errors, batch=${batchId}`,
    );

    // Log parsing errors server-side for audit trail
    if (errors.length > 0) {
      this.logger.warn(`Sales import batch=${batchId}: ${errors.length} parsing error(s)`);
      // Log first 10 errors in detail
      errors.slice(0, 10).forEach((err) => this.logger.warn(`  ${err}`));
      if (errors.length > 10) {
        this.logger.warn(`  ... and ${errors.length - 10} more errors`);
      }
    }

    // Warn if all rows were skipped — likely wrong column layout
    if (skipped > 0 && imported === 0 && orders.length === 0) {
      this.logger.warn(
        `Sales import batch=${batchId}: ALL ${skipped} rows skipped! ` +
        `This likely means the Excel column layout doesn't match. ` +
        `Headers: ${JSON.stringify(headerPreview)}`,
      );
    }

    // Archive original file to Telegram channel (non-blocking)
    // Always archive the file for audit trail, even if 0 imported
    this.archiveFileToTelegram(fileBuffer, batchId, originalName || 'import.xlsx', imported).catch(
      (err) => this.logger.warn(`Failed to archive file for batch ${batchId}: ${err}`),
    );

    // Truncate errors to 50 for client response
    const errorsTruncated = errors.length > 50;
    const clientErrors = errorsTruncated
      ? [...errors.slice(0, 50), `... ещё ${errors.length - 50} ошибок (см. серверные логи)`]
      : errors;

    return {
      imported,
      skipped,
      duplicates,
      errors: clientErrors,
      batchId,
      machinesFound: machineCodesFound.size,
      machinesNotFound: [...machineCodesNotFound],
    };
  }

  /**
   * Archive uploaded file to Telegram channel and save file_id to DB.
   */
  private async archiveFileToTelegram(
    fileBuffer: Buffer,
    batchId: string,
    originalName: string,
    importedCount: number,
  ): Promise<void> {
    const channelId = this.telegramService.getArchiveChannelId();
    if (!channelId) {
      this.logger.debug('TELEGRAM_ARCHIVE_CHANNEL_ID not set, skipping file archive');
      return;
    }

    const statusText = importedCount > 0 ? `Импортировано: ${importedCount} заказов` : '⚠️ 0 импортировано (проверьте формат файла)';
    const caption = `📁 <b>Импорт продаж</b>\nBatch: <code>${batchId}</code>\nФайл: ${originalName}\n${statusText}\nДата: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`;

    const result = await this.telegramService.sendDocument(channelId, fileBuffer, originalName, caption);
    if (!result) {
      this.logger.warn(`Failed to send file to archive channel for batch ${batchId}`);
      return;
    }

    await this.importFileRepository.save({
      batchId,
      originalName,
      telegramFileId: result.fileId,
      telegramMessageId: result.messageId,
      fileSize: fileBuffer.length,
    });

    this.logger.log(`File archived to Telegram for batch ${batchId}, file_id=${result.fileId}`);
  }

  /**
   * Get download URL for original import file by batchId.
   */
  async getImportFileUrl(batchId: string): Promise<{ url: string; originalName: string } | null> {
    const file = await this.importFileRepository.findOne({ where: { batchId } });
    if (!file) return null;

    const url = await this.telegramService.getFileUrl(file.telegramFileId);
    if (!url) return null;

    return { url, originalName: file.originalName };
  }

  /**
   * Get orders with pagination and filters
   */
  async getOrders(query: SalesQueryDto): Promise<{ data: SalesOrder[]; total: number }> {
    const qb = this.salesOrderRepository
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.machine', 'machine');

    if (query.machineCode) {
      qb.andWhere('LOWER(so.machineCode) = LOWER(:machineCode)', {
        machineCode: query.machineCode,
      });
    }

    if (query.paymentMethod) {
      qb.andWhere('so.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    }

    if (query.paymentStatus) {
      qb.andWhere('so.paymentStatus = :paymentStatus', {
        paymentStatus: query.paymentStatus,
      });
    }

    if (query.from) {
      const isExact = isFullTimestamp(query.from);
      const fromDate = isExact ? new Date(query.from) : startOfDayTashkent(query.from);
      qb.andWhere('so.orderDate >= :from', { from: fromDate });
      this.logger.debug(`getOrders from: "${query.from}" → isExact=${isExact} → ${fromDate.toISOString()}`);
    }
    if (query.to) {
      const isExact = isFullTimestamp(query.to);
      const toDate = isExact ? new Date(query.to) : endOfDayTashkent(query.to);
      qb.andWhere('so.orderDate <= :to', { to: toDate });
      this.logger.debug(`getOrders to: "${query.to}" → isExact=${isExact} → ${toDate.toISOString()}`);
    }

    const page = query.page || 1;
    const limit = query.limit || 50;

    qb.orderBy('so.orderDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    this.logger.debug(`getOrders result: ${total} total, returning ${data.length}`);
    return { data, total };
  }

  /**
   * Get summary: cash/card totals per machine
   */
  async getSummary(query: { from?: string; to?: string }): Promise<{
    machines: Array<{
      machineCode: string;
      machineName: string | null;
      cashTotal: number;
      cashCount: number;
      cardTotal: number;
      cardCount: number;
      refundTotal: number;
      refundCount: number;
    }>;
    totals: {
      cashTotal: number;
      cashCount: number;
      cardTotal: number;
      cardCount: number;
      refundTotal: number;
      refundCount: number;
    };
  }> {
    const qb = this.salesOrderRepository
      .createQueryBuilder('so')
      .leftJoin('so.machine', 'machine')
      .select([
        'so.machineCode AS "machineCode"',
        'machine.name AS "machineName"',
        `COALESCE(SUM(CASE WHEN so.paymentMethod = :cash AND so.paymentStatus = :paid THEN so.price ELSE 0 END), 0) AS "cashTotal"`,
        `COUNT(CASE WHEN so.paymentMethod = :cash AND so.paymentStatus = :paid THEN 1 END) AS "cashCount"`,
        `COALESCE(SUM(CASE WHEN so.paymentMethod = :card AND so.paymentStatus = :paid THEN so.price ELSE 0 END), 0) AS "cardTotal"`,
        `COUNT(CASE WHEN so.paymentMethod = :card AND so.paymentStatus = :paid THEN 1 END) AS "cardCount"`,
        `COALESCE(SUM(CASE WHEN so.paymentStatus = :refunded THEN so.price ELSE 0 END), 0) AS "refundTotal"`,
        `COUNT(CASE WHEN so.paymentStatus = :refunded THEN 1 END) AS "refundCount"`,
      ])
      .setParameters({
        cash: PaymentMethod.CASH,
        card: PaymentMethod.CARD,
        paid: PaymentStatus.PAID,
        refunded: PaymentStatus.REFUNDED,
      })
      .groupBy('so.machineCode')
      .addGroupBy('machine.name')
      .orderBy('"cashTotal"', 'DESC');

    if (query.from) {
      const fromDate = isFullTimestamp(query.from) ? new Date(query.from) : startOfDayTashkent(query.from);
      qb.andWhere('so.orderDate >= :from', { from: fromDate });
    }
    if (query.to) {
      const toDate = isFullTimestamp(query.to) ? new Date(query.to) : endOfDayTashkent(query.to);
      qb.andWhere('so.orderDate <= :to', { to: toDate });
    }

    const results = await qb.getRawMany();

    const machines = results.map((r) => ({
      machineCode: r.machineCode,
      machineName: r.machineName || null,
      cashTotal: Math.round(Number(r.cashTotal) * 100) / 100,
      cashCount: parseInt(r.cashCount) || 0,
      cardTotal: Math.round(Number(r.cardTotal) * 100) / 100,
      cardCount: parseInt(r.cardCount) || 0,
      refundTotal: Math.round(Number(r.refundTotal) * 100) / 100,
      refundCount: parseInt(r.refundCount) || 0,
    }));

    const totals = machines.reduce(
      (acc, m) => ({
        cashTotal: acc.cashTotal + m.cashTotal,
        cashCount: acc.cashCount + m.cashCount,
        cardTotal: acc.cardTotal + m.cardTotal,
        cardCount: acc.cardCount + m.cardCount,
        refundTotal: acc.refundTotal + m.refundTotal,
        refundCount: acc.refundCount + m.refundCount,
      }),
      { cashTotal: 0, cashCount: 0, cardTotal: 0, cardCount: 0, refundTotal: 0, refundCount: 0 },
    );

    return { machines, totals };
  }

  /**
   * RECONCILIATION: compare cash sales from orders with collection amounts.
   *
   * Optimised single-query approach (replaces the old N+1 loop):
   *   1. CTE "collection_pairs" — uses LAG() window function to build
   *      consecutive (prev, curr) pairs of RECEIVED collections per machine.
   *   2. LEFT JOIN sales_orders — aggregate cash/paid orders that fall
   *      within each (prev_collected_at, collected_at] window.
   *   3. One round-trip to the DB instead of (machines × collections) queries.
   */
  async getReconciliation(query: ReconciliationQueryDto): Promise<ReconciliationResult> {
    const params: Record<string, unknown> = {
      receivedStatus: CollectionStatus.RECEIVED,
      cashMethod: PaymentMethod.CASH,
      paidStatus: PaymentStatus.PAID,
    };

    // Build optional WHERE clauses for collections
    const collectionFilters: string[] = ['c.status = :receivedStatus'];
    if (query.from) {
      collectionFilters.push('c.collected_at >= :cfrom');
      params.cfrom = startOfDayTashkent(query.from);
    }
    if (query.to) {
      collectionFilters.push('c.collected_at <= :cto');
      params.cto = endOfDayTashkent(query.to);
    }

    // Optional machine filter
    let machineFilter = '';
    if (query.machineCode) {
      machineFilter = 'AND LOWER(m.code) = LOWER(:filterMachineCode)';
      params.filterMachineCode = query.machineCode;
    }

    const sql = `
      WITH collection_pairs AS (
        SELECT
          c.id              AS collection_id,
          c.machine_id,
          m.code            AS machine_code,
          m.name            AS machine_name,
          c.amount,
          c.collected_at,
          LAG(c.collected_at) OVER (
            PARTITION BY c.machine_id ORDER BY c.collected_at ASC
          ) AS prev_collected_at
        FROM collections c
        INNER JOIN machines m ON m.id = c.machine_id ${machineFilter}
        WHERE ${collectionFilters.join(' AND ')}
      )
      SELECT
        cp.collection_id   AS "collectionId",
        cp.machine_code    AS "machineCode",
        cp.machine_name    AS "machineName",
        cp.prev_collected_at AS "periodStart",
        cp.collected_at    AS "periodEnd",
        cp.amount          AS "actualAmount",
        COALESCE(SUM(so.price), 0) AS "expectedAmount",
        COUNT(so.id)       AS "cashOrdersCount"
      FROM collection_pairs cp
      LEFT JOIN sales_orders so
        ON LOWER(so.machine_code) = LOWER(cp.machine_code)
        AND so.payment_method = :cashMethod
        AND so.payment_status = :paidStatus
        AND so.order_date > cp.prev_collected_at
        AND so.order_date <= cp.collected_at
      WHERE cp.prev_collected_at IS NOT NULL
      GROUP BY
        cp.collection_id,
        cp.machine_code,
        cp.machine_name,
        cp.prev_collected_at,
        cp.collected_at,
        cp.amount
      ORDER BY cp.collected_at DESC
    `;

    // Convert named :params to positional $1..$N for raw PostgreSQL query
    const paramEntries = Object.entries(params);
    let positionalSql = sql;
    const positionalValues: unknown[] = [];
    paramEntries.forEach(([key, value], index) => {
      positionalSql = positionalSql.replace(new RegExp(`:${key}`, 'g'), `$${index + 1}`);
      positionalValues.push(value);
    });

    const rows: Array<{
      collectionId: string;
      machineCode: string;
      machineName: string;
      periodStart: Date;
      periodEnd: Date;
      actualAmount: string;
      expectedAmount: string;
      cashOrdersCount: string;
    }> = await this.salesOrderRepository.manager.query(positionalSql, positionalValues);

    // Debug: log first 3 rows to verify timestamp comparison
    if (rows.length > 0) {
      this.logger.debug(
        `Reconciliation: ${rows.length} rows. First 3: ` +
        rows.slice(0, 3).map((r) =>
          `${r.machineCode}: period=${new Date(r.periodStart).toISOString()}..${new Date(r.periodEnd).toISOString()}, ` +
          `expected=${r.expectedAmount}, actual=${r.actualAmount}, orders=${r.cashOrdersCount}`,
        ).join(' | '),
      );
    }

    const items: ReconciliationItem[] = rows.map((r) => {
      const expectedAmount = Math.round(Number(r.expectedAmount) * 100) / 100;
      const actualAmount = Math.round(Number(r.actualAmount || 0) * 100) / 100;
      const difference = Math.round((expectedAmount - actualAmount) * 100) / 100;
      const percentDeviation = expectedAmount > 0
        ? Math.round((difference / expectedAmount) * 10000) / 100
        : 0;

      let status: ReconciliationItem['status'];
      if (expectedAmount === 0 && actualAmount === 0) {
        status = 'no_sales';
      } else if (difference === 0) {
        status = 'matched';
      } else if (actualAmount < expectedAmount) {
        status = 'shortage';
      } else {
        status = 'overage';
      }

      return {
        machineCode: r.machineCode,
        machineName: r.machineName || r.machineCode,
        periodStart: new Date(r.periodStart).toISOString(),
        periodEnd: new Date(r.periodEnd).toISOString(),
        expectedAmount,
        actualAmount,
        difference,
        percentDeviation,
        status,
        cashOrdersCount: parseInt(r.cashOrdersCount) || 0,
        collectionId: r.collectionId,
      };
    });

    const summary = items.reduce(
      (acc, item) => ({
        totalExpected: acc.totalExpected + item.expectedAmount,
        totalActual: acc.totalActual + item.actualAmount,
        totalDifference: acc.totalDifference + item.difference,
        matchedCount: acc.matchedCount + (item.status === 'matched' ? 1 : 0),
        shortageCount: acc.shortageCount + (item.status === 'shortage' ? 1 : 0),
        overageCount: acc.overageCount + (item.status === 'overage' ? 1 : 0),
        noSalesCount: acc.noSalesCount + (item.status === 'no_sales' ? 1 : 0),
      }),
      {
        totalExpected: 0, totalActual: 0, totalDifference: 0,
        matchedCount: 0, shortageCount: 0, overageCount: 0, noSalesCount: 0,
      },
    );

    return { items, summary };
  }

  /**
   * Export reconciliation results as Excel file
   */
  async exportReconciliation(query: ReconciliationQueryDto): Promise<Buffer> {
    const result = await this.getReconciliation(query);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Сверка');

    // Header
    sheet.columns = [
      { header: 'Автомат', key: 'machineName', width: 25 },
      { header: 'Код', key: 'machineCode', width: 15 },
      { header: 'Начало периода', key: 'periodStart', width: 18 },
      { header: 'Конец периода', key: 'periodEnd', width: 18 },
      { header: 'Продажи (нал)', key: 'expectedAmount', width: 18 },
      { header: 'Инкассация', key: 'actualAmount', width: 18 },
      { header: 'Разница', key: 'difference', width: 15 },
      { header: '% отклонения', key: 'percentDeviation', width: 14 },
      { header: 'Заказов (нал)', key: 'cashOrdersCount', width: 14 },
      { header: 'Статус', key: 'status', width: 15 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    };

    const statusLabels: Record<string, string> = {
      matched: 'Совпадает',
      shortage: 'Недостача',
      overage: 'Излишек',
      no_sales: 'Нет продаж',
    };

    // Data rows
    for (const item of result.items) {
      const row = sheet.addRow({
        machineName: item.machineName,
        machineCode: item.machineCode,
        periodStart: new Date(item.periodStart).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' }),
        periodEnd: new Date(item.periodEnd).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' }),
        expectedAmount: item.expectedAmount,
        actualAmount: item.actualAmount,
        difference: item.difference,
        percentDeviation: item.percentDeviation,
        cashOrdersCount: item.cashOrdersCount,
        status: statusLabels[item.status] || item.status,
      });

      // Highlight shortages in red
      if (item.status === 'shortage') {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFDE8E8' },
          };
        });
      } else if (item.status === 'overage') {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF3E0' },
          };
        });
      }
    }

    // Summary row
    sheet.addRow({});
    const summaryRow = sheet.addRow({
      machineName: 'ИТОГО',
      expectedAmount: result.summary.totalExpected,
      actualAmount: result.summary.totalActual,
      difference: result.summary.totalDifference,
      status: `Совп: ${result.summary.matchedCount}, Нед: ${result.summary.shortageCount}, Изл: ${result.summary.overageCount}`,
    });
    summaryRow.font = { bold: true };

    // Number format for amount columns
    ['expectedAmount', 'actualAmount', 'difference'].forEach((key) => {
      const col = sheet.getColumn(key);
      col.numFmt = '#,##0.00';
    });
    sheet.getColumn('percentDeviation').numFmt = '0.0"%"';

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Get daily sales stats grouped by date and payment method.
   * Used for Recharts graphs.
   */
  async getDailyStats(query: { from?: string; to?: string }): Promise<Array<{
    date: string;
    cashTotal: number;
    cashCount: number;
    cardTotal: number;
    cardCount: number;
  }>> {
    const qb = this.salesOrderRepository
      .createQueryBuilder('so')
      .select([
        `TO_CHAR(so.orderDate AT TIME ZONE 'UTC' AT TIME ZONE '${PG_TASHKENT_TZ}', 'YYYY-MM-DD') AS "date"`,
        `COALESCE(SUM(CASE WHEN so.paymentMethod = :cash AND so.paymentStatus = :paid THEN so.price ELSE 0 END), 0) AS "cashTotal"`,
        `COUNT(CASE WHEN so.paymentMethod = :cash AND so.paymentStatus = :paid THEN 1 END) AS "cashCount"`,
        `COALESCE(SUM(CASE WHEN so.paymentMethod = :card AND so.paymentStatus = :paid THEN so.price ELSE 0 END), 0) AS "cardTotal"`,
        `COUNT(CASE WHEN so.paymentMethod = :card AND so.paymentStatus = :paid THEN 1 END) AS "cardCount"`,
      ])
      .setParameters({
        cash: PaymentMethod.CASH,
        card: PaymentMethod.CARD,
        paid: PaymentStatus.PAID,
      })
      .groupBy(`TO_CHAR(so.orderDate AT TIME ZONE 'UTC' AT TIME ZONE '${PG_TASHKENT_TZ}', 'YYYY-MM-DD')`)
      .orderBy('"date"', 'ASC');

    if (query.from) {
      const fromDate = isFullTimestamp(query.from) ? new Date(query.from) : startOfDayTashkent(query.from);
      qb.andWhere('so.orderDate >= :from', { from: fromDate });
    }
    if (query.to) {
      const toDate = isFullTimestamp(query.to) ? new Date(query.to) : endOfDayTashkent(query.to);
      qb.andWhere('so.orderDate <= :to', { to: toDate });
    }

    const results = await qb.getRawMany();
    return results.map((r) => ({
      date: r.date,
      cashTotal: Math.round(Number(r.cashTotal) * 100) / 100,
      cashCount: parseInt(r.cashCount) || 0,
      cardTotal: Math.round(Number(r.cardTotal) * 100) / 100,
      cardCount: parseInt(r.cardCount) || 0,
    }));
  }

  /**
   * Get top machines by total sales.
   */
  async getTopMachines(query: { from?: string; to?: string; limit?: number }): Promise<Array<{
    machineCode: string;
    machineName: string | null;
    total: number;
    count: number;
  }>> {
    const qb = this.salesOrderRepository
      .createQueryBuilder('so')
      .leftJoin('so.machine', 'machine')
      .select([
        'so.machineCode AS "machineCode"',
        'machine.name AS "machineName"',
        'COALESCE(SUM(so.price), 0) AS "total"',
        'COUNT(*) AS "count"',
      ])
      .where('so.paymentStatus = :paid', { paid: PaymentStatus.PAID })
      .groupBy('so.machineCode')
      .addGroupBy('machine.name')
      .orderBy('"total"', 'DESC')
      .limit(query.limit || 10);

    if (query.from) {
      const fromDate = isFullTimestamp(query.from) ? new Date(query.from) : startOfDayTashkent(query.from);
      qb.andWhere('so.orderDate >= :from', { from: fromDate });
    }
    if (query.to) {
      const toDate = isFullTimestamp(query.to) ? new Date(query.to) : endOfDayTashkent(query.to);
      qb.andWhere('so.orderDate <= :to', { to: toDate });
    }

    const results = await qb.getRawMany();
    return results.map((r) => ({
      machineCode: r.machineCode,
      machineName: r.machineName || null,
      total: Math.round(Number(r.total) * 100) / 100,
      count: parseInt(r.count) || 0,
    }));
  }

  /**
   * Delete all orders from a specific import batch
   */
  async deleteBatch(batchId: string): Promise<{ deleted: number }> {
    const result = await this.salesOrderRepository.delete({ importBatchId: batchId });
    return { deleted: result.affected || 0 };
  }

  /**
   * Get unique machine codes from sales data
   */
  async getMachineCodes(): Promise<string[]> {
    const results = await this.salesOrderRepository
      .createQueryBuilder('so')
      .select('DISTINCT so.machineCode', 'machineCode')
      .orderBy('so.machineCode', 'ASC')
      .getRawMany();
    return results.map((r) => r.machineCode);
  }

  /**
   * Get import batches info
   */
  async getImportBatches(): Promise<Array<{
    batchId: string;
    importedAt: string;
    ordersCount: number;
  }>> {
    const results = await this.salesOrderRepository
      .createQueryBuilder('so')
      .select([
        'so.importBatchId AS "batchId"',
        'MIN(so.importedAt) AS "importedAt"',
        'COUNT(*) AS "ordersCount"',
      ])
      .groupBy('so.importBatchId')
      .orderBy('"importedAt"', 'DESC')
      .getRawMany();

    return results.map((r) => ({
      batchId: r.batchId,
      importedAt: r.importedAt,
      ordersCount: parseInt(r.ordersCount) || 0,
    }));
  }
}
