// Entrada serverless para Vercel: importa la app ya compilada por `npm run build`
// (Vercel no resuelve imports sin extensión hacia src/*.ts en runtime).
import app from "../dist/server.js";

export default app;
