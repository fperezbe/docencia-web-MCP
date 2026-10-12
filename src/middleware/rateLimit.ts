import rateLimit from "express-rate-limit";

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
