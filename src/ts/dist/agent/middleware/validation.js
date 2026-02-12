/**
 * Create an Express middleware that validates request.body against a Zod schema.
 * Returns 400 with structured error for invalid requests.
 */
export function createValidationMiddleware(schema) {
  return function validationMiddleware(req, res, next) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const zodError = result.error;
      const details = zodError.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      const response = {
        error: "INVALID_REQUEST",
        message: "Request validation failed",
        details: { issues: details },
      };
      res.status(400).json(response);
      return;
    }
    // Replace body with parsed (and coerced) data
    req.body = result.data;
    next();
  };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL2FnZW50L21pZGRsZXdhcmUvdmFsaWRhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFJQTs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsMEJBQTBCLENBQUMsTUFBaUI7SUFDMUQsT0FBTyxTQUFTLG9CQUFvQixDQUNsQyxHQUFZLEVBQ1osR0FBYSxFQUNiLElBQWtCO1FBRWxCLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTFDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDcEIsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEtBQWlCLENBQUM7WUFDMUMsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzlDLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7Z0JBQzFCLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTzthQUN2QixDQUFDLENBQUMsQ0FBQztZQUVKLE1BQU0sUUFBUSxHQUFrQjtnQkFDOUIsS0FBSyxFQUFFLGlCQUFpQjtnQkFDeEIsT0FBTyxFQUFFLDJCQUEyQjtnQkFDcEMsT0FBTyxFQUFFLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRTthQUM3QixDQUFDO1lBRUYsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDL0IsT0FBTztRQUNULENBQUM7UUFFRCw4Q0FBOEM7UUFDOUMsR0FBRyxDQUFDLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ3ZCLElBQUksRUFBRSxDQUFDO0lBQ1QsQ0FBQyxDQUFDO0FBQ0osQ0FBQyJ9
