const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');
const Empresa = require('../models/Empresa');

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
    // 2. Le decimos a Mongo que busque las conversaciones de las Empresas del usuario
    const empresas = req.empresas && req.empresas.length > 0 ? req.empresas : [empresaId];
    const query = { empresaId: { $in: empresas } };

    const conversaciones = await Conversacion.find(query)
      .populate('contactoId', 'nombre telefono direccion pisoDepto codigoPostal etiquetas notas')
      .sort({ updatedAt: -1 })
      .lean();

    // 3. Obtener datos básicos de las empresas del usuario para el selector
    const empresasDocs = await Empresa.find({ _id: { $in: empresas } }).lean();
    const empresasInfo = empresasDocs.map(e => ({
      _id: e._id.toString(),
      nombre: e.nombre,
      whatsappPhoneId: e.whatsappPhoneId
    }));

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
      conversaciones: conversacionesConMensajes,
      empresas: empresasInfo
    });
  } catch (error) {
    console.error('Error al obtener conversaciones:', error);
    return res.status(500).json({ error: 'Error interno al obtener conversaciones' });
  }
};

module.exports = {
  obtenerConversaciones
};
