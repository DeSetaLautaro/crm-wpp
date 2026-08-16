// const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación basado en JWT.
 * ⚠️ VERSIÓN MOCK (PUENTEADA) PARA PRUEBAS ⚠️
 */
module.exports = (req, res, next) => {
  /* // --- CÓDIGO ORIGINAL COMENTADO HASTA QUE HAGAMOS EL LOGIN ---
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload;
    req.parrillaId = payload.parrillaId || payload.empresaId;

    if (!req.parrillaId) {
      return res.status(403).json({ error: 'El token no contiene un parrillaId válido' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  */

  // --- NUEVO CÓDIGO PUENTE (MOCK) ---
  // Simulamos que el usuario ya pasó el login y le damos tu ID real
  
  const miIdDePrueba = '6a813310d6701057e9262a02'; // <-- ¡Pegá el tuyo acá! Ej: '64b1c2d3e4f5...'

  req.usuario = { id: miIdDePrueba, parrillaId: miIdDePrueba };
  req.parrillaId = miIdDePrueba;

  // Dejamos pasar la petición
  next();
};