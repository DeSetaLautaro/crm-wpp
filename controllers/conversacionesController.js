const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');

/**
 * GET /api/conversaciones
 * Devuelve todas las conversaciones de la Parrilla del usuario logueado,
 * incluyendo cada array de mensajes.
 */
const obtenerConversaciones = async (req, res) => {
  try {
    // 1. Ahora buscamos el empresaId que nos inyecta el middleware
    const empresaId = req.empresaId || req.parrillaId;

    if (!empresaId) {
      return res.status(400).json({ error: 'No se pudo identificar la Empresa asociada al usuario' });
    }
    console.log("1. ID QUE ME LLEGA DEL PUENTE:", empresaId);
    
    const todasLasConversaciones = await Conversacion.find({});
    console.log("2. TOTAL DE CHATS EN LA BASE DE DATOS:", todasLasConversaciones.length);
    
    if (todasLasConversaciones.length > 0) {
        console.log("3. EL ID GUARDADO EN EL PRIMER CHAT ES:", todasLasConversaciones[0].empresaId);
    }

    // 2. Le decimos a Mongo que busque las conversaciones de esta Empresa
    const query = { empresaId: empresaId };

    const conversaciones = await Conversacion.find(query)
      .populate('contactoId', 'nombre telefono direccion pisoDepto codigoPostal etiquetas')
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
