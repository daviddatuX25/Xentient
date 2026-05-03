import { Server } from "net";
import pino from "pino";

const logger = pino({ name: "port-fallback" }, process.stderr);

const MAX_ATTEMPTS = parseInt(process.env.PORT_FALLBACK_RANGE ?? "20", 10);

/**
 * Bind an existing server (http.Server or net.Server) to a port with auto-fallback.
 * If EADDRINUSE, tries port+1, port+2, etc. up to MAX_ATTEMPTS.
 * Returns the actual port bound.
 */
export function listenWithFallback(server: Server, preferredPort: number, label: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (attempt: number) => {
      const port = preferredPort + attempt;

      const onError = (err: NodeJS.ErrnoException) => {
        server.removeListener("error", onError);
        if (err.code === "EADDRINUSE" && attempt < MAX_ATTEMPTS - 1) {
          logger.warn({ port, label }, "Port in use — trying next port");
          tryPort(attempt + 1);
        } else if (err.code === "EADDRINUSE") {
          reject(new Error(`${label}: ports ${preferredPort}-${port} all in use (tried ${attempt + 1} ports) — set WS_PORT/CAMERA_WS_PORT/CONTROL_PORT to an available port, or stop other instances`));
        } else {
          reject(err);
        }
      };

      server.on("error", onError);

      server.listen(port, () => {
        server.removeListener("error", onError);
        const actualPort = (server.address() as { port: number }).port;
        if (actualPort !== preferredPort) {
          logger.warn({ requested: preferredPort, actual: actualPort, label }, "Port fallback applied");
        }
        resolve(actualPort);
      });
    };

    tryPort(0);
  });
}