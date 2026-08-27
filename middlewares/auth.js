const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación basado en JWT.
 */
module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const tokenHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenQuery = req.query.token || null;
  const token = tokenHeader || tokenQuery || null;

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload;
    req.usuario.id = payload.userId || payload.id || payload._id || payload.sub;
    // Soporte para múltiples empresas (varias líneas de WhatsApp)
    req.empresas = payload.empresas || (payload.empresaId ? [payload.empresaId] : []);
    req.empresaId = payload.empresaId || req.empresas[0] || null;
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
