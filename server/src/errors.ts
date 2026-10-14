/** Error with an HTTP status and a stable, client-safe code and message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const Errors = {
  validation: (message: string) => new ApiError(400, "VALIDATION_ERROR", message),
  unauthenticated: () => new ApiError(401, "UNAUTHENTICATED", "Your session has expired. Please sign in again."),
  invalidCredentials: () => new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password."),
  locked: (retryAfterSeconds: number) =>
    new ApiError(
      429,
      "ACCOUNT_TEMPORARILY_LOCKED",
      "Too many failed sign-in attempts. Please wait a few minutes and try again, or reset your password.",
      retryAfterSeconds,
    ),
  rateLimited: (retryAfterSeconds: number) =>
    new ApiError(429, "RATE_LIMITED", "Too many requests. Please wait a moment and try again.", retryAfterSeconds),
  notFound: () => new ApiError(404, "NOT_FOUND", "Not found."),
  serviceUnavailable: (message: string) => new ApiError(503, "SERVICE_UNAVAILABLE", message),
};
