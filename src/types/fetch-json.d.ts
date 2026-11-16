/** Restore generic `Response.json<T>()` (previously provided by workers-types). */
interface Body {
  json<T = unknown>(): Promise<T>;
}
