export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function formatCurrency(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
