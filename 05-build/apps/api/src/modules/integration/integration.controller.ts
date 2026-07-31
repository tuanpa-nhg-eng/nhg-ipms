import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsObject, IsOptional, IsString, IsUUID, Length,
  Matches,
} from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { Exported, ExportExempt } from '../../common/export/export.decorators';
import { IntegrationService } from './integration.service';
import { OutboxDispatcher } from './outbox.dispatcher';
import { MorningTodosService } from './morning-todos.service';

class CreateConnectionDto {
  @IsIn(['notion', 'ms_planner', 'ms_todo', 'bravo', 'salesforce', 'crm', 'hris', 'csv']) provider!: string;
  @IsOptional() @IsString() @Length(1, 255) displayName?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

class CreateContractDto {
  @IsString() @Length(1, 50) provider!: string;
  @IsOptional() @IsIn(['in', 'out']) direction?: string;
  @IsObject() schema!: Record<string, unknown>;
}

class CreateBindingDto {
  @IsUUID() connectionId!: string;
  @IsString() @Length(1, 50) localType!: string; // 'evidence'|'morning_todos'|'goal'...
  @IsOptional() @IsUUID() localId?: string;
  @IsIn(['in', 'out', 'both']) direction!: string;
  @IsOptional() @IsObject() externalTarget?: Record<string, unknown>;
  @IsObject() fieldMap!: Record<string, unknown>;
  @IsOptional() @IsObject() syncPolicy?: Record<string, unknown>;
}

class ReplayOutboxDto {
  @IsIn(['skipped', 'dead']) status!: 'skipped' | 'dead';
  // id outbox_event (BIGINT — nhận string); bỏ trống = replay toàn bộ status đó của tenant
  @IsOptional() @IsArray() @ArrayMaxSize(500) @Matches(/^\d+$/, { each: true })
  eventIds?: string[];
}

class MorningTodosDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}

class ImportCsvDto {
  @IsString() @Length(1, 50) sourceSystem!: string;
  @IsOptional() @IsUUID() connectionId?: string;
  // [F25-style] trần 500 row/batch — batch lớn chia nhiều lần gọi
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  rows!: Array<Record<string, unknown>>;
}

@Controller('integrations')
export class IntegrationController {
  constructor(
    private integrations: IntegrationService,
    private outbox: OutboxDispatcher,
    private morningTodos: MorningTodosService,
  ) {}

  @Post('connections')
  @RequirePermission('integration:connect')
  @Audited('integration_connection.create')
  createConnection(@CurrentUser() user: RequestUser, @Body() dto: CreateConnectionDto) {
    return this.integrations.createConnection(user, dto);
  }

  @Post('contracts')
  @RequirePermission('integration:bind')
  @Audited('data_contract.create')
  createContract(@CurrentUser() user: RequestUser, @Body() dto: CreateContractDto) {
    return this.integrations.createContract(user, dto as any);
  }

  @Get('runs')
  @RequirePermission('integration:run')
  listRuns(@CurrentUser() user: RequestUser) {
    return this.integrations.listRuns(user);
  }

  /** Binding local↔external — nền cho outbox dispatch + morning-todos (lát 4b). */
  @Post('bindings')
  @RequirePermission('integration:bind')
  @Audited('integration_binding.create')
  createBinding(@CurrentUser() user: RequestUser, @Body() dto: CreateBindingDto) {
    return this.integrations.createBinding(user, dto);
  }

  /** Đẩy outbox pending của tenant hiện tại (worker BullMQ dùng chung logic này). */
  @Post('outbox/dispatch')
  @RequirePermission('integration:run')
  @Audited('outbox.dispatch')
  /**
   * [Trục C L1] Đường xuất số 2 — dữ liệu ra hệ NGOÀI qua connector.
   *
   * ⚠️ Mã `system.log` (internal) đúng với hiện trạng HÔM NAY và chỉ hôm nay: producer duy
   * nhất đang ghi outbox_event là `integration.importCsv` với `eventType =
   * 'evidence.batch_imported'`, payload là THỐNG KÊ một lần nạp (nguồn + số đếm) — không
   * mang nội dung bằng chứng, không mang PII. Ngày nào có producer đẩy payload nghiệp vụ
   * thật (goal/review/evidence) ra ngoài thì khai báo này SAI và phải đổi: `review.result`
   * hay `hr.profile` ra `external_service` sẽ bị `exportDecision` chặn thẳng, đúng như
   * Strategic Context §9.3 muốn. Đó là lý do dòng này ghi rõ giả định thay vì chọn một mã
   * chung chung cho tiện.
   *
   * ⚠️ [Trục C L6 — NỢ ĐÃ TRẢ] Trước lát này, khai báo `@Exported` nằm ở ĐÂY và worker BullMQ
   * gọi thẳng `dispatchTenant()` nên KHÔNG đi qua cổng: đường chạy thật trong production nằm
   * ngoài kiểm soát, còn đường bấm tay thì được gác. Cổng + ghi vết đã dời xuống service để cả
   * hai người gọi đi qua cùng một chỗ; route này chuyển sang `@ExportExempt` để không ghi vết
   * HAI LẦN cho cùng một lần đẩy.
   */
  @ExportExempt('Cổng xuất + ghi vết nằm ở OutboxDispatcher.dispatchTenant (worker cũng đi qua đó)')
  dispatchOutbox(@CurrentUser() user: RequestUser) {
    return this.outbox.dispatchTenant(user.tenantId, 50, user.claims.sub);
  }

  /** [F65] Replay event skipped/dead → pending (vd sau khi thêm binding khớp / hệ ngoài đã phục hồi). */
  // [Trục C L1] KHÔNG khai @Exported có chủ đích: replay chỉ đổi status trong DB (dead/skipped
  // → pending), không đẩy gì ra ngoài. Dòng dữ liệu ra xảy ra ở `outbox/dispatch` — nơi đã
  // khai — nên khai cả ở đây sẽ ghi vết một lần xuất KHÔNG xảy ra, làm sổ vết nói sai.
  @Post('outbox/replay')
  @RequirePermission('integration:run')
  @Audited('outbox.replay')
  replayOutbox(@CurrentUser() user: RequestUser, @Body() dto: ReplayOutboxDto) {
    return this.outbox.replayTenant(
      user.tenantId, dto.status, dto.eventIds?.map((id) => BigInt(id)),
    );
  }

  /** Job morning-todos: goal active/at_risk/off_track → todo hệ ngoài (mock) — idempotent theo ngày. */
  @Post('jobs/morning-todos/run')
  @RequirePermission('integration:run')
  @Audited('job.morning_todos')
  /**
   * [Trục C L1] Đường xuất số 3 — và là ví dụ vì sao heuristic đường dẫn một mình không đủ:
   * tên route không có chữ "export"/"download" nào, nhưng mỗi lần chạy là đẩy tên mục tiêu +
   * mã nhân viên ra hệ todo ngoài. Bắt được vì snapshot bề mặt xuất đóng đinh danh sách khai
   * báo, không vì `looksLikeEgress` đoán ra.
   *
   * `objective.kpi` (internal): payload là tiêu đề mục tiêu, kỳ, sức khoẻ, và
   * `ownerEmployeeCode` — mã nhân viên, KHÔNG tên/email (ẩn danh chuẩn dự án). Nếu ngày nào
   * payload thêm tên người thì mã phải đổi sang `hr.profile` (confidential) và đường này bị
   * chặn ra ngoài — đúng ý.
   */
  @Exported({
    asset: 'objective.kpi',
    destination: 'external_todo',
    destinationKind: 'external_service',
    count: (r) => r?.pushed ?? 0,
  })
  runMorningTodos(@CurrentUser() user: RequestUser, @Body() dto: MorningTodosDto) {
    return this.morningTodos.run(user, dto.date);
  }

  /** Import CSV (fallback ETL cho AIC/Salesforce/CRM) — validate data_contract, idempotent. */
  @Post('import/csv')
  @RequirePermission('integration:run')
  @Audited('integration.import_csv')
  // [Trục C L1] Dữ liệu VÀO, không ra. Khớp hint 'csv' của heuristic egress nên phải miễn trừ
  // TƯỜNG MINH — nếu không, bật chặn ở lát này sẽ giết một đường nạp dữ liệu hoàn toàn hợp lệ
  // (đúng cái "chặn oan" mà kế hoạch dặn tránh). `INGRESS_MARKERS` đã bắt 'import', khai thêm
  // ở đây để ý định nằm trong mã chứ không chỉ trong regex.
  @ExportExempt('nạp CSV VÀO hệ — không phải đường dữ liệu ra')
  importCsv(@CurrentUser() user: RequestUser, @Body() dto: ImportCsvDto) {
    return this.integrations.importCsv(user, dto);
  }
}
