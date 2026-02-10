import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ReportQueryDto } from './dto/report-query.dto';
import * as XLSX from 'xlsx';

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

    const wb = XLSX.utils.book_new();

    // By Machine sheet (sanitize strings to prevent Excel formula injection)
    const machineData = byMachine.data.map((item) => ({
      'Код': sanitizeForExcel(item.machine.code),
      'Название': sanitizeForExcel(item.machine.name),
      'Кол-во': item.collectionsCount,
      'Сумма': item.totalAmount,
      'Среднее': Math.round(item.averageAmount),
    }));
    machineData.push({
      'Код': '',
      'Название': 'ИТОГО',
      'Кол-во': byMachine.totals.collectionsCount,
      'Сумма': byMachine.totals.totalAmount,
      'Среднее': 0,
    });
    const machineSheet = XLSX.utils.json_to_sheet(machineData);
    XLSX.utils.book_append_sheet(wb, machineSheet, 'По автоматам');

    // By Date sheet (sanitize strings to prevent Excel formula injection)
    const dateData = byDate.data.map((item) => ({
      'Дата': sanitizeForExcel(item.date),
      'Кол-во': item.collectionsCount,
      'Сумма': item.totalAmount,
    }));
    dateData.push({
      'Дата': 'ИТОГО',
      'Кол-во': byDate.totals.collectionsCount,
      'Сумма': byDate.totals.totalAmount,
    });
    const dateSheet = XLSX.utils.json_to_sheet(dateData);
    XLSX.utils.book_append_sheet(wb, dateSheet, 'По датам');

    // By Operator sheet (sanitize strings to prevent Excel formula injection)
    const operatorData = byOperator.data.map((item) => ({
      'Оператор': sanitizeForExcel(item.operator.name),
      'Telegram': sanitizeForExcel(item.operator.telegramUsername || '-'),
      'Кол-во': item.collectionsCount,
      'Сумма': item.totalAmount,
    }));
    operatorData.push({
      'Оператор': 'ИТОГО',
      'Telegram': '',
      'Кол-во': byOperator.totals.collectionsCount,
      'Сумма': byOperator.totals.totalAmount,
    });
    const operatorSheet = XLSX.utils.json_to_sheet(operatorData);
    XLSX.utils.book_append_sheet(wb, operatorSheet, 'По операторам');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=vendcash-report-${new Date().toISOString().split('T')[0]}.xlsx`,
    );
    res.send(buffer);
  }
}
