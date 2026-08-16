const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación basado en JWT.
 * Se espera un header `Authorization: Bearer <token>`.
 * El token debe contener al menos el `parrillaId` (o `empresaId`) del usuario.
 */
module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Exponer la info del usuario en req.usuario
    req.usuario = payload;

    // La propiedad que identifica a la Parrilla puede llamarse parrillaId o empresaId
    req.parrillaId = payload.parrillaId || payload.empresaId;

    if (!req.parrillaId) {
      return res.status(403).json({ error: 'El token no contiene un parrillaId válido' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};
