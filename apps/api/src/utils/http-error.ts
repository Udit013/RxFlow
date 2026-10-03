/**
 * An Error carrying an HTTP status. The global error handler surfaces the message of any
 * status < 500 to the client — use this for expected business-rule failures (insufficient
 * stock, foreign references) that would otherwise collapse into a generic 500.
 */
export function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode })
}
