const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación basado en JWT.
 */
module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload;
    req.usuario.id = payload.id || payload._id || payload.sub;
    // También asignamos parrillaId para compatibilidad con código existente
    req.parrillaId = payload.parrillaId || payload.empresaId || req.usuario.id;

    if (!req.usuario.id) {
      return res.status(403).json({ error: 'El token no contiene un identificador de usuario válido' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};
