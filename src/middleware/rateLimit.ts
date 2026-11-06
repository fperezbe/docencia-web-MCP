import { rateLimit } from "express-rate-limit";

// Tope blando para el login de la app (evita fuerza bruta al /api/auth/*).
export const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tope estricto para guardar credenciales de DocenciaWeb (cada intento pega a la plataforma).
export const limiteConexionDocencia = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de conexión. Espera unos minutos." },
});

// Tope para la API v1 con API key. Cada extracción pega a DocenciaWeb y es lenta.
export const limiteApi = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones. Espera unos minutos y reintenta." },
});

// Crear/revocar API keys no es una operación frecuente.
export const limiteApiKeys = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas operaciones sobre API keys. Espera unos minutos." },
});
