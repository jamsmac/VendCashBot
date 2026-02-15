import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { TelegramService } from '../../telegram/telegram.service';
import { SettingsService, SETTING_KEYS } from '../settings/settings.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SalesQueryDto, ReconciliationQueryDto, DateRangeQueryDto, TopMachinesQueryDto } from './dto/sales-query.dto';

@ApiTags('sales')
@Controller('sales')
@ApiBearerAuth()
@RequireModule('sales')
export class SalesController {
  private readonly logger = new Logger(SalesController.name);

  constructor(
    private readonly salesService: SalesService,
    private readonly telegramService: TelegramService,
    private readonly settingsService: SettingsService,
  ) {}

  @Post('import')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Import sales orders from Excel file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
      fileFilter: (_req, file, cb) => {
        const allowedMimes = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ];
        if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Допустимы только Excel файлы (.xlsx, .xls)'), false);
        }
      },
    }),
  )
  async importExcel(@UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size?: number }) {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }
    const fileSizeMb = ((file.size || file.buffer.length) / (1024 * 1024)).toFixed(2);
    this.logger.log(`Sales import started: ${file.originalname} (${fileSizeMb} MB)`);

    const result = await this.salesService.importExcel(file.buffer, file.originalname);

    this.logger.log(
      `Sales import completed: batch=${result.batchId} imported=${result.imported} ` +
      `duplicates=${result.duplicates} skipped=${result.skipped} errors=${result.errors.length}`,
    );
    return result;
  }

  @Get('orders')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get sales orders with filters and pagination' })
  async getOrders(@Query() query: SalesQueryDto) {
    return this.salesService.getOrders(query);
  }

  @Get('summary')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get sales summary by machine (cash/card/refunds)' })
  async getSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.salesService.getSummary({ from, to });
  }

  @Get('reconciliation')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Compare cash sales with collections (reconciliation)' })
  async getReconciliation(@Query() query: ReconciliationQueryDto) {
    return this.salesService.getReconciliation(query);
  }

  @Post('reconciliation/notify')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Run reconciliation and send Telegram alerts for shortages above threshold' })
  async notifyReconciliationShortages(@Query() query: ReconciliationQueryDto) {
    const result = await this.salesService.getReconciliation(query);

    // Get threshold from settings (default 10%)
    const threshold = await this.settingsService.getNumericSetting(
      SETTING_KEYS.SHORTAGE_ALERT_THRESHOLD,
      10,
    );

    const significantShortages = result.items
      .filter((item) => item.status === 'shortage' && Math.abs(item.percentDeviation) > threshold);

    if (significantShortages.length > 0) {
      try {
        await this.telegramService.notifyReconciliationShortages(significantShortages);
      } catch (err) {
        this.logger.error('Failed to send reconciliation alerts', err);
      }
    }

    return {
      totalItems: result.items.length,
      shortagesFound: significantShortages.length,
      alertsSent: significantShortages.length > 0,
    };
  }

  @Get('reconciliation/export')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Export reconciliation report as Excel file' })
  async exportReconciliation(
    @Query() query: ReconciliationQueryDto,
    @Res() res: Response,
  ) {
    const buffer = await this.salesService.exportReconciliation(query);
    const filename = `reconciliation_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('daily-stats')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get daily sales stats (cash/card totals)' })
  async getDailyStats(@Query() query: DateRangeQueryDto) {
    return this.salesService.getDailyStats(query);
  }

  @Get('top-machines')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get top machines by total sales' })
  async getTopMachines(@Query() query: TopMachinesQueryDto) {
    return this.salesService.getTopMachines(query);
  }

  @Get('machine-codes')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get unique machine codes from sales data' })
  async getMachineCodes() {
    return this.salesService.getMachineCodes();
  }

  @Get('batches')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get import batches info' })
  async getBatches() {
    return this.salesService.getImportBatches();
  }

  @Delete('batches/:batchId')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete all orders from a specific import batch' })
  async deleteBatch(@Param('batchId') batchId: string) {
    return this.salesService.deleteBatch(batchId);
  }

  @Get('batches/:batchId/file')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get download URL for original import file' })
  async getImportFileUrl(@Param('batchId') batchId: string) {
    const result = await this.salesService.getImportFileUrl(batchId);
    if (!result) {
      throw new NotFoundException('Файл не найден или не был сохранён');
    }
    return result;
  }
}
