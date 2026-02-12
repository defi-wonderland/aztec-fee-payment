import pino from "pino";
const REDACT_PATHS = [
    "spSigningKey",
    "req.headers.authorization",
    "req.body.signature",
    "secret",
    "witness",
    "privateKey",
    "signingKey",
];
/**
 * Create a pino logger configured per the agent spec.
 *
 * - JSON output in production, pretty-printed otherwise
 * - ISO timestamps
 * - Sensitive field redaction
 */
export function createAgentLogger(config) {
    const isProduction = process.env.NODE_ENV === "production";
    return pino({
        level: config.logLevel,
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
            level: (label) => ({ level: label }),
        },
        redact: REDACT_PATHS,
        ...(isProduction
            ? {}
            : {
                transport: {
                    target: "pino-pretty",
                    options: {
                        colorize: true,
                        translateTime: "SYS:standard",
                        ignore: "pid,hostname",
                    },
                },
            }),
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vYWdlbnQvbWlkZGxld2FyZS9sb2dnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBS3hCLE1BQU0sWUFBWSxHQUFHO0lBQ25CLGNBQWM7SUFDZCwyQkFBMkI7SUFDM0Isb0JBQW9CO0lBQ3BCLFFBQVE7SUFDUixTQUFTO0lBQ1QsWUFBWTtJQUNaLFlBQVk7Q0FDYixDQUFDO0FBRUY7Ozs7OztHQU1HO0FBQ0gsTUFBTSxVQUFVLGlCQUFpQixDQUMvQixNQUFxQztJQUVyQyxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsS0FBSyxZQUFZLENBQUM7SUFFM0QsT0FBTyxJQUFJLENBQUM7UUFDVixLQUFLLEVBQUUsTUFBTSxDQUFDLFFBQVE7UUFDdEIsU0FBUyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPO1FBQ3hDLFVBQVUsRUFBRTtZQUNWLEtBQUssRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQztTQUNyQztRQUNELE1BQU0sRUFBRSxZQUFZO1FBQ3BCLEdBQUcsQ0FBQyxZQUFZO1lBQ2QsQ0FBQyxDQUFDLEVBQUU7WUFDSixDQUFDLENBQUM7Z0JBQ0UsU0FBUyxFQUFFO29CQUNULE1BQU0sRUFBRSxhQUFhO29CQUNyQixPQUFPLEVBQUU7d0JBQ1AsUUFBUSxFQUFFLElBQUk7d0JBQ2QsYUFBYSxFQUFFLGNBQWM7d0JBQzdCLE1BQU0sRUFBRSxjQUFjO3FCQUN2QjtpQkFDRjthQUNGLENBQUM7S0FDUCxDQUFDLENBQUM7QUFDTCxDQUFDIn0=