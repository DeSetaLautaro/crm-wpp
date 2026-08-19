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
    req.usuario.id = payload.userId || payload.id || payload._id || payload.sub;
    // La empresa a la que pertenece el CRM (puede venir como empresaId o parrillaId)
    req.empresaId = payload.empresaId || payload.parrillaId || null;
    // Compatibilidad con código que todavía usa parrillaId
    req.parrillaId = req.empresaId;

    if (!req.usuario.id) {
      return res.status(403).json({ error: 'El token no contiene un identificador de usuario válido' });
    }

    if (!req.empresaId) {
      return res.status(403).json({ error: 'El token no contiene una empresa válida' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};
