import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ApiError } from '@ipms/shared';

/** Error model chuẩn TDD §8.2. */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const traceId = randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body: any = exception.getResponse();
      message = typeof body === 'string' ? body : (Array.isArray(body?.message) ? body.message.join('; ') : body?.message ?? exception.message);
      code =
        status === 400 ? 'VALIDATION_ERROR'
        : status === 401 ? 'UNAUTHENTICATED'
        : status === 403 ? 'FORBIDDEN'
        : status === 404 ? 'NOT_FOUND'
        : status === 409 ? 'CONFLICT'
        : status === 422 ? 'BUSINESS_RULE'
        : status === 429 ? 'RATE_LIMITED'
        : 'HTTP_ERROR';
    } else {
      console.error(`[${traceId}]`, exception);
    }

    const payload: ApiError = { error: { code, message, trace_id: traceId } };
    res.status(status).json(payload);
  }
}
