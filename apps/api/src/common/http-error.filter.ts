import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

/** Preserve domain validation contracts while hiding infrastructure errors and parser input. */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const parser = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : parser === 'entity.too.large'
          ? 413
          : parser === 'entity.parse.failed'
            ? 400
            : 500;
    const detail = error instanceof HttpException ? error.getResponse() : undefined;
    response.status(status).json({
      statusCode: status,
      ...(typeof detail === 'object'
        ? detail
        : {
            message:
              typeof detail === 'string'
                ? detail
                : status === 413
                  ? 'Requisição acima do limite permitido.'
                  : status === 400
                    ? 'JSON inválido.'
                    : 'Serviço temporariamente indisponível.',
          }),
      requestId: response.getHeader('X-Request-Id'),
    });
  }
}
