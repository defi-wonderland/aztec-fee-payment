// ── Single concrete error class ─────────────────────────────────────────────
export class AppError extends Error {
    constructor(statusCode, code, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = "AppError";
    }
    toResponse() {
        return {
            error: this.code,
            message: this.message,
            ...(this.details ? { details: this.details } : {}),
        };
    }
}
// ── Factory functions ───────────────────────────────────────────────────────
export const invalidInput = (code, message, details) => new AppError(400, code, message, details);
export const notFound = (code, message, details) => new AppError(404, code, message, details);
export const rateLimited = (message = "Too many requests") => new AppError(429, "RATE_LIMITED", message);
export const internal = (message = "Internal server error", details) => new AppError(500, "INTERNAL_ERROR", message, details);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXJyb3JzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vYWdlbnQvZXJyb3JzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUVBLCtFQUErRTtBQUUvRSxNQUFNLE9BQU8sUUFBUyxTQUFRLEtBQUs7SUFDakMsWUFDa0IsVUFBa0IsRUFDbEIsSUFBZSxFQUMvQixPQUFlLEVBQ0MsT0FBaUM7UUFFakQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBTEMsZUFBVSxHQUFWLFVBQVUsQ0FBUTtRQUNsQixTQUFJLEdBQUosSUFBSSxDQUFXO1FBRWYsWUFBTyxHQUFQLE9BQU8sQ0FBMEI7UUFHakQsSUFBSSxDQUFDLElBQUksR0FBRyxVQUFVLENBQUM7SUFDekIsQ0FBQztJQUVELFVBQVU7UUFDUixPQUFPO1lBQ0wsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2hCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztZQUNyQixHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7U0FDbkQsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQUVELCtFQUErRTtBQUUvRSxNQUFNLENBQUMsTUFBTSxZQUFZLEdBQUcsQ0FDMUIsSUFBZSxFQUNmLE9BQWUsRUFDZixPQUFpQyxFQUNqQyxFQUFFLENBQUMsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFFL0MsTUFBTSxDQUFDLE1BQU0sUUFBUSxHQUFHLENBQ3RCLElBQWUsRUFDZixPQUFlLEVBQ2YsT0FBaUMsRUFDakMsRUFBRSxDQUFDLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBRS9DLE1BQU0sQ0FBQyxNQUFNLFdBQVcsR0FBRyxDQUFDLE9BQU8sR0FBRyxtQkFBbUIsRUFBRSxFQUFFLENBQzNELElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxjQUFjLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFFN0MsTUFBTSxDQUFDLE1BQU0sUUFBUSxHQUFHLENBQ3RCLE9BQU8sR0FBRyx1QkFBdUIsRUFDakMsT0FBaUMsRUFDakMsRUFBRSxDQUFDLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUMifQ==