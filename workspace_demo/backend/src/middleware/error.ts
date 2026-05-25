import type { NextFunction, Request, Response } from 'express';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const message = err instanceof Error ? err.message : 'Unknown error';
  // eslint-disable-next-line no-console
  console.error('[error]', message);
  res.status(500).json({ error: message });
}
