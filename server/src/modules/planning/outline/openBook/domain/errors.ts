import { AppError } from "../../../../../middleware/errorHandler";
export class OutlineOpenBookError extends AppError {
  constructor(readonly code: string, message: string, statusCode = 409, details?: unknown) { super(message, statusCode, details); }
}
