/**
 * Minimal structured logger. Callers must never pass passwords, tokens, emails,
 * request bodies or health information. Only operational metadata is logged.
 */
type Level = "info" | "warn" | "error";

function write(level: Level, message: string, fields?: Record<string, unknown>) {
  if (process.env.LOG_SILENT === "1") return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
