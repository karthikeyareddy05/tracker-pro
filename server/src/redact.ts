/** Removes credentials from any connection string that appears in an error message. */
export function redact(message: string): string {
  return message.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]+@/gi, "$1***:***@").replace(/re_[A-Za-z0-9_]{6,}/g, "re_***");
}
