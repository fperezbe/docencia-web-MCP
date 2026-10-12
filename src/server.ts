import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { verifyAccessTokenRequest } from "better-auth/oauth2";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { MCP_RESOURCE, auth } from "./auth.js";
import { db, schema } from "./db/index.js";
import { env } from "./env.js";
import { docenciaRouter } from "./routes/docencia.js";
import { paginasRouter } from "./routes/paginas.js";
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
// Descubrimiento OAuth en la raíz (RFC 8414 / RFC 9728): ChatGPT y Claude lo piden aquí.
app.all("/.well-known/*", toNodeHandler(auth));

app.use(express.json({ limit: "1mb" }));

// Páginas del flujo OAuth (login y consentimiento).
app.use(paginasRouter);

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

// URL de la metadata del recurso protegido (fórmula RFC 9728, igual que el plugin).
function urlMetadataRecurso(): string {
  return `${env.BETTER_AUTH_URL.replace(/\/+$/, "")}/.well-known/oauth-protected-resource/mcp`;
}

// Issuer OAuth real (baseURL del contexto, incluye el basePath /api/auth).
async function issuerOAuth(): Promise<string> {
  try {
    const ctx = (await auth.$context) as unknown as { baseURL?: unknown };
    if (typeof ctx.baseURL === "string" && ctx.baseURL) {
      return ctx.baseURL.replace(/\/+$/, "");
    }
  } catch {
    /* usa el valor por defecto de abajo */
  }
  return `${env.BETTER_AUTH_URL.replace(/\/+$/, "")}/api/auth`;
}

// Resuelve el usuario de la app ante /mcp por cualquiera de las dos vías:
// 1) sesión Better Auth (cookie o Bearer de sesión: REST y puente mcp-remote),
// 2) access token OAuth/JWT (ChatGPT y Claude Desktop).
async function resolverUsuarioMcp(req: Request): Promise<{ userId: string; email: string } | null> {
  try {
    const datos = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (datos?.user) return { userId: datos.user.id, email: datos.user.email };
  } catch {
    /* cae al flujo OAuth */
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const issuer = await issuerOAuth();
    const dpop = req.headers.dpop;
    const claims = await verifyAccessTokenRequest(
      {
        authorizationHeader: authHeader,
        dpopProofJwt: Array.isArray(dpop) ? (dpop[0] ?? null) : (dpop ?? null),
        method: req.method,
        url: `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`,
      },
      {
        verifyOptions: { issuer, audience: MCP_RESOURCE },
        jwksUrl: `${issuer}/jwks`,
      },
    );
    if (typeof claims.sub !== "string" || !claims.sub) return null;
    const filas = await db
      .select({ id: schema.user.id, email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, claims.sub))
      .limit(1);
    const u = filas[0];
    if (!u) return null;
    return { userId: u.id, email: u.email };
  } catch {
    return null;
  }
}

// MCP Streamable HTTP en modo sin estado: un servidor por petición.
// Cada usuario (sesión u OAuth) opera solo sobre su propia conexión de DocenciaWeb.
app.post("/mcp", async (req: Request, res: Response) => {
  const identidad = await resolverUsuarioMcp(req);
  if (!identidad) {
    res
      .status(401)
      .set("WWW-Authenticate", `Bearer resource_metadata="${urlMetadataRecurso()}"`)
      .json({
        jsonrpc: "2.0",
        id: (req.body as { id?: unknown } | undefined)?.id ?? null,
        error: {
          code: -32001,
          message: "No autenticado. Completa el login OAuth en ChatGPT/Claude, o envía un Bearer válido.",
        },
      });
    return;
  }
  try {
    const server = createUserMcpServer({ userId: identidad.userId, email: identidad.email });
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
