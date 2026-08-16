const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');

/**
 * GET /api/conversaciones
 * Devuelve todas las conversaciones de la Parrilla del usuario logueado,
 * incluyendo cada array de mensajes.
 */
const obtenerConversaciones = async (req, res) => {
  try {
    const parrillaId = req.parrillaId;

    if (!parrillaId) {
      return res.status(400).json({ error: 'No se pudo identificar la Parrilla asociada al usuario' });
    }

    // En el modelo actual el campo que identifica al tenant se llama empresaId,
    // pero podría llamarse parrillaId en tu base. Usamos ambas posibilidades.
    const query = {
      $or: [
        { empresaId: parrillaId },
        { parrillaId }
      ]
    };

    const conversaciones = await Conversacion.find(query)
      .populate('contactoId', 'nombre telefono Etiqueta')
      .sort({ updatedAt: -1 })
      .lean();

    const conversacionesConMensajes = await Promise.all(
      conversaciones.map(async (conv) => {
        const mensajes = await Mensaje.find({ conversacionId: conv._id })
          .sort({ createdAt: 1 })
          .lean();

        return {
          _id: conv._id,
          empresaId: conv.empresaId,
          parrillaId: conv.parrillaId || conv.empresaId,
          contactoId: conv.contactoId,
          lineaReceptora: conv.lineaReceptora,
          botActivo: conv.botActivo,
          estado: conv.estado,
          ultimoMensaje: conv.ultimoMensaje,
          updatedAt: conv.updatedAt,
          mensajes: mensajes.map((m) => ({
            _id: m._id,
            remitente: m.remitente,
            contenido: m.contenido,
            fecha: m.createdAt
          }))
        };
      })
    );

    return res.json({
      ok: true,
      conversaciones: conversacionesConMensajes
    });
  } catch (error) {
    console.error('Error al obtener conversaciones:', error);
    return res.status(500).json({ error: 'Error interno al obtener conversaciones' });
  }
};

module.exports = {
  obtenerConversaciones
};
const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');

/**
 * GET /api/conversaciones
 * Devuelve todas las conversaciones de la Parrilla del usuario logueado,
 * incluyendo cada array de mensajes.
 */
const obtenerConversaciones = async (req, res) => {
  try {
    const parrillaId = req.parrillaId;

    if (!parrillaId) {
      return res.status(400).json({ error: 'No se pudo identificar la Parrilla asociada al usuario' });
    }

    // En el modelo actual el campo que identifica al tenant se llama empresaId,
    // pero podría llamarse parrillaId en tu base. Usamos ambas posibilidades.
    const query = {
      $or: [
        { empresaId: parrillaId },
        { parrillaId }
      ]
    };

    const conversaciones = await Conversacion.find(query)
      .populate('contactoId', 'nombre telefono')
      .sort({ updatedAt: -1 })
      .lean();

    const conversacionesConMensajes = await Promise.all(
      conversaciones.map(async (conv) => {
        const mensajes = await Mensaje.find({ conversacionId: conv._id })
          .sort({ createdAt: 1 })
          .lean();

        return {
          _id: conv._id,
          empresaId: conv.empresaId,
          parrillaId: conv.parrillaId || conv.empresaId,
          contactoId: conv.contactoId,
          lineaReceptora: conv.lineaReceptora,
          botActivo: conv.botActivo,
          estado: conv.estado,
          ultimoMensaje: conv.ultimoMensaje,
          updatedAt: conv.updatedAt,
          mensajes: mensajes.map((m) => ({
            _id: m._id,
            remitente: m.remitente,
            contenido: m.contenido,
            fecha: m.createdAt
          }))
        };
      })
    );

    return res.json({
      ok: true,
      conversaciones: conversacionesConMensajes
    });
  } catch (error) {
    console.error('Error al obtener conversaciones:', error);
    return res.status(500).json({ error: 'Error interno al obtener conversaciones' });
  }
};

module.exports = {
  obtenerConversaciones
};
