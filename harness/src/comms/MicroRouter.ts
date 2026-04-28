import { IncomingMessage, ServerResponse } from "http";

/**
 * MicroRouter — Zero-dependency route table for ControlServer
 *
 * Supports method matching, path parameters (`:id`), and structured 404/405 responses.
 * Named capture groups extract path params; trailing slashes are optional.
 */

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

interface RouteMatch {
  handler: RouteHandler;
  params: Record<string, string>;
}

interface RouteMiss {
  status: number;
}

export class MicroRouter {
  private routes: Route[] = [];

  /**
   * Register a route. Path segments like `:id` become named capture groups.
   * Trailing slashes are optional (`/api/skills/` matches `/api/skills`).
   * Returns `this` for fluent chaining: `router.add(...).add(...)`.
   */
  add(method: string, path: string, handler: RouteHandler): this {
    const paramNames: string[] = [];
    const patternStr = path.replace(/:(\w+)/g, (_m, name) => {
      paramNames.push(name);
      return `(?<${name}>[^/]+)`;
    });
    const pattern = new RegExp(`^${patternStr}/?$`);
    this.routes.push({ method: method.toUpperCase(), pattern, paramNames, handler });
    return this;
  }

  /**
   * Resolve a request to a handler or an error status.
   * Returns `{ handler, params }` on match, or `{ status }` on miss.
   * Status 405 = path matched but method didn't; 404 = no path match.
   */
  resolve(method: string, url: string): RouteMatch | RouteMiss {
    const pathname = url.split("?")[0];
    const methodUpper = method.toUpperCase();
    let pathMatched = false;

    for (const route of this.routes) {
      const match = route.pattern.exec(pathname);
      if (!match) continue;
      pathMatched = true;
      if (route.method !== methodUpper) continue;

      const params: Record<string, string> = {};
      if (match.groups) {
        for (const name of route.paramNames) {
          if (match.groups[name] !== undefined) params[name] = match.groups[name];
        }
      }
      return { handler: route.handler, params };
    }
    return { status: pathMatched ? 405 : 404 };
  }
}