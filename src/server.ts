import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { auth } from "./auth.js";
import { env } from "./env.js";
import { docenciaRouter } from "./routes/docencia.js";
import { createUserMcpServer } from "./mcp/server.js";
import { limiteAuth } from "./middleware/rateLimit.js";

const app = express();
app.disable("x-powered-by");

app.use(
  cors({
    origin: env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    // Los clientes web leen aquí el Bearer token tras el login.
    exposedHeaders: ["set-auth-token"],
  }),
);

// Better Auth antes de express.json (su handler lee el cuerpo por su cuenta).
app.all("/api/auth/*", limiteAuth, toNodeHandler(auth));

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, servicio: "docenciaweb-mcp" });
});

app.get("/api/me", async (req, res) => {
  const datos = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!datos) {
    res.status(401).json({ error: "No autenticado." });
    return;
  }
  res.json({
    user: datos.user,
    session: { id: datos.session.id, expiresAt: datos.session.expiresAt },
  });
});

app.use("/api/docencia", docenciaRouter);

// MCP Streamable HTTP en modo sin estado: un servidor por petición, autenticado
// con la sesión de Better Auth (cookie o Bearer). Cada usuario usa su conexión.
app.post("/mcp", async (req: Request, res: Response) => {
  const datos = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!datos?.user) {
    res
      .status(401)
      .json({ error: "No autenticado. Inicia sesión en Better Auth y envía la cookie o el Bearer token." });
    return;
  }
  try {
    const server = createUserMcpServer({ userId: datos.user.id, email: datos.user.email });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(err instanceof Error ? err.stack : String(err));
    if (!res.headersSent) {
      res.status(500).json({ error: "Error interno del servidor MCP." });
    }
  }
});

// Sin estado: no hay streams SSE persistentes ni sesiones que terminar.
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Usa POST /mcp (Streamable HTTP en modo sin estado)." },
    id: null,
  });
});
app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Usa POST /mcp (Streamable HTTP en modo sin estado)." },
    id: null,
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

// Nunca se vuelca el cuerpo de la petición: podría incluir contraseñas.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err instanceof Error ? err.stack : String(err));
  if (res.headersSent) return;
  const status =
    typeof err === "object" && err !== null && "status" in err && typeof err.status === "number"
      ? err.status
      : 500;
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: "Error interno." });
});

export default app;

// En Vercel (serverless) no se abre puerto: la app se exporta y sirve vía api/index.ts.
if (!process.env.VERCEL) {
  app.listen(env.PORT, env.HOST, () => {
    console.log(`docenciaweb-mcp listo en http://${env.HOST}:${env.PORT}  (MCP en POST /mcp)`);
  });
}
