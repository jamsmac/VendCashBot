import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import * as ExcelJS from 'exceljs';
import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ReportQueryDto } from './dto/report-query.dto';

/**
 * Sanitize string values for Excel export to prevent formula injection.
 * Characters =, +, -, @, |, and tab can trigger formula execution in Excel.
 */
function sanitizeForExcel(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // Prefix dangerous characters with a single quote to prevent formula execution
  if (/^[=+\-@|\t]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

@ApiTags('reports')
@Controller('reports')
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get summary report' })
  async getSummary(@Query() query: ReportQueryDto) {
    return this.reportsService.getSummary(query);
  }

  @Get('dashboard')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get dashboard summary' })
  async getDashboard() {
    return this.reportsService.getTodaySummary();
  }

  @Get('by-machine')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get report by machine' })
  async getByMachine(@Query() query: ReportQueryDto) {
    return this.reportsService.getByMachine(query);
  }

  @Get('by-date')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get report by date' })
  async getByDate(@Query() query: ReportQueryDto) {
    return this.reportsService.getByDate(query);
  }

  @Get('by-operator')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get report by operator' })
  async getByOperator(@Query() query: ReportQueryDto) {
    return this.reportsService.getByOperator(query);
  }

  @Get('export')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Export report to Excel' })
  async exportToExcel(@Query() query: ReportQueryDto, @Res() res: Response) {
    const [byMachine, byDate, byOperator] = await Promise.all([
      this.reportsService.getByMachine(query),
      this.reportsService.getByDate(query),
      this.reportsService.getByOperator(query),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'VendCash';
    wb.created = new Date();

    // By Machine sheet
    const machineSheet = wb.addWorksheet('По автоматам');
    machineSheet.columns = [
      { header: 'Код', key: 'code', width: 15 },
      { header: 'Название', key: 'name', width: 25 },
      { header: 'Кол-во', key: 'count', width: 12 },
      { header: 'Сумма', key: 'total', width: 18 },
      { header: 'Среднее', key: 'avg', width: 15 },
    ];
    byMachine.data.forEach((item) => {
      machineSheet.addRow({
        code: sanitizeForExcel(item.machine.code),
        name: sanitizeForExcel(item.machine.name),
        count: item.collectionsCount,
        total: item.totalAmount,
        avg: Math.round(item.averageAmount),
      });
    });
    machineSheet.addRow({
      code: '',
      name: 'ИТОГО',
      count: byMachine.totals.collectionsCount,
      total: byMachine.totals.totalAmount,
      avg: 0,
    });

    // By Date sheet
    const dateSheet = wb.addWorksheet('По датам');
    dateSheet.columns = [
      { header: 'Дата', key: 'date', width: 15 },
      { header: 'Кол-во', key: 'count', width: 12 },
      { header: 'Сумма', key: 'total', width: 18 },
    ];
    byDate.data.forEach((item) => {
      dateSheet.addRow({
        date: sanitizeForExcel(item.date),
        count: item.collectionsCount,
        total: item.totalAmount,
      });
    });
    dateSheet.addRow({
      date: 'ИТОГО',
      count: byDate.totals.collectionsCount,
      total: byDate.totals.totalAmount,
    });

    // By Operator sheet
    const operatorSheet = wb.addWorksheet('По операторам');
    operatorSheet.columns = [
      { header: 'Оператор', key: 'operator', width: 25 },
      { header: 'Telegram', key: 'telegram', width: 20 },
      { header: 'Кол-во', key: 'count', width: 12 },
      { header: 'Сумма', key: 'total', width: 18 },
    ];
    byOperator.data.forEach((item) => {
      operatorSheet.addRow({
        operator: sanitizeForExcel(item.operator.name),
        telegram: sanitizeForExcel(item.operator.telegramUsername || '-'),
        count: item.collectionsCount,
        total: item.totalAmount,
      });
    });
    operatorSheet.addRow({
      operator: 'ИТОГО',
      telegram: '',
      count: byOperator.totals.collectionsCount,
      total: byOperator.totals.totalAmount,
    });

    // Style header rows (bold)
    [machineSheet, dateSheet, operatorSheet].forEach((sheet) => {
      sheet.getRow(1).font = { bold: true };
    });

    const buffer = await wb.xlsx.writeBuffer();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=vendcash-report-${new Date().toISOString().split('T')[0]}.xlsx`,
    );
    res.send(Buffer.from(buffer));
  }
}
