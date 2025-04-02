// server/index.ts
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { patronusEvaluationMiddleware } from "./lib/patronus";
import { setupWebSocketServer } from "./websocketServer";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Debug Patronus middleware
const debugId = Math.floor(Math.random() * 1000);
console.log(`[Patronus Setup #${debugId}] Starting middleware setup...`);
console.log(`[Patronus Setup #${debugId}] API Key present:`, !!process.env.PATRONUS_API_KEY);
console.log(`[Patronus Setup #${debugId}] API Key length:`, process.env.PATRONUS_API_KEY?.length || 0);

try {
  app.use((req, res, next) => {
    console.log(`[Patronus Debug] Incoming request: ${req.method} ${req.path}`);
    return patronusEvaluationMiddleware(req, res, next);
  });
  console.log(`[Patronus Setup #${debugId}] Middleware setup complete`);
} catch (error) {
  console.error(`[Patronus Setup #${debugId}] Error setting up middleware:`, error);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log("Starting server initialization...");

    // Check for already used port and increment if needed
    const findAvailablePort = async (startPort: number): Promise<number> => {
      return new Promise((resolve) => {
        import('http').then(httpModule => {
          const server = httpModule.createServer();
          server.listen(startPort, () => {
            server.close(() => resolve(startPort));
          });
          server.on('error', () => {
            resolve(findAvailablePort(startPort + 1));
          });
        });
      });
    };

    const port = await findAvailablePort(5000);
    console.log(`Found available port: ${port}`);

    const server = await registerRoutes(app, port);
    console.log(`Routes registered successfully`);

    // Setup WebSocket server for audio streaming
    const wss = setupWebSocketServer(server);
    console.log(`WebSocket server initialized`);

    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Error caught in middleware:', err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      // Removed throw err to prevent crashing the server
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
      console.log("Vite setup complete");
    } else {
      serveStatic(app);
      console.log("Static serving setup complete");
    }

    // Use the port we determined earlier
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Fatal error during server startup:', error);
    process.exit(1);
  }
})();