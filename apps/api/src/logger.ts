/**
 * Structured JSON logger for use both inside NestJS (via NestLogger) and
 * in standalone worker functions outside the DI container.
 *
 * Output format (one JSON object per line):
 * {"ts":"2026-03-19T10:00:00.000Z","level":"INFO","ctx":"SlaWorker","msg":"...","...extraFields}
 */

import type { LoggerService } from '@nestjs/common';

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

function write(level: Level, ctx: string, message: string, extra?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    ctx,
    msg: message,
  };

  if (extra && Object.keys(extra).length > 0) {
    Object.assign(entry, extra);
  }

  const line = JSON.stringify(entry);

  if (level === 'ERROR' || level === 'FATAL') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export class Logger {
  constructor(private readonly context: string) {}

  log(message: string, extra?: Record<string, unknown>) {
    write('INFO', this.context, message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>) {
    write('WARN', this.context, message, extra);
  }

  error(message: string, extra?: Record<string, unknown>) {
    write('ERROR', this.context, message, extra);
  }

  debug(message: string, extra?: Record<string, unknown>) {
    write('DEBUG', this.context, message, extra);
  }
}

/**
 * NestJS LoggerService adapter — passes to the same JSON writer above.
 * Usage: app.useLogger(new NestLogger());
 */
export class NestLogger implements LoggerService {
  log(message: any, context?: string) {
    write('INFO', context || 'App', String(message));
  }

  error(message: any, trace?: string, context?: string) {
    write('ERROR', context || 'App', String(message), trace ? { trace } : undefined);
  }

  warn(message: any, context?: string) {
    write('WARN', context || 'App', String(message));
  }

  debug(message: any, context?: string) {
    write('DEBUG', context || 'App', String(message));
  }

  verbose(message: any, context?: string) {
    write('DEBUG', context || 'App', String(message));
  }
}
