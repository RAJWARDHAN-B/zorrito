export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function badRequest(message: string) {
  return new AppError(400, "INVALID_REQUEST", message);
}
