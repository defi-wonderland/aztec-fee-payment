import rateLimit from "express-rate-limit";
/**
 * Create rate limiter middleware using express-rate-limit.
 * Key: req.ip (resolved via Express trust proxy setting).
 */
export function createRateLimiter(config) {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? "unknown",
    handler: (_req, res) => {
      res.status(429).json({
        error: "RATE_LIMITED",
        message: "Too many requests, please try again later",
      });
    },
  });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmF0ZUxpbWl0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vYWdlbnQvbWlkZGxld2FyZS9yYXRlTGltaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxTQUFTLE1BQU0sb0JBQW9CLENBQUM7QUFHM0M7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLGlCQUFpQixDQUFDLE1BQWdDO0lBQ2hFLE9BQU8sU0FBUyxDQUFDO1FBQ2YsUUFBUSxFQUFFLE1BQU0sQ0FBQyxRQUFRO1FBQ3pCLEdBQUcsRUFBRSxNQUFNLENBQUMsV0FBVztRQUN2QixlQUFlLEVBQUUsSUFBSTtRQUNyQixhQUFhLEVBQUUsS0FBSztRQUNwQixZQUFZLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksU0FBUztRQUMxQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEVBQUU7WUFDckIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQ25CLEtBQUssRUFBRSxjQUFjO2dCQUNyQixPQUFPLEVBQUUsMkNBQTJDO2FBQzdCLENBQUMsQ0FBQztRQUM3QixDQUFDO0tBQ0YsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyJ9
