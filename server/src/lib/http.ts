import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  return schema.parse(body);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`) });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const e = err as { type?: string; code?: string; message?: string };
  if (e?.type === "entity.too.large" || e?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "File is too large (max 12 MB)" });
    return;
  }
  console.error("[vistora] unhandled error:", err);
  res.status(500).json({ error: "Something went wrong on our side" });
}
