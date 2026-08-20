import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wrap an async route handler so a rejected promise reaches Express.
 *
 * Express 4 only catches synchronous throws. An async handler that rejects
 * produces an unhandled rejection, which Node 20 treats as fatal — so a
 * single transient failure (a hiccup reaching storage, an unexpected shape
 * in saved data) kills the whole server.
 *
 * On a laptop that shows up as a stack trace and a restart. On Cloud Run it
 * is a crash loop in front of a ten-year-old who has no way to fix it, so
 * every async handler goes through here.
 */
export function wrap(
  handler: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}
