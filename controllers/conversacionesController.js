const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');
const Empresa = require('../models/Empresa');
const Pedido = require('../models/Pedido');

function normalizarTelefono(tel) {
  const digits = String(tel || '').replace(/\D/g, '');
  if (digits.startsWith('54') && digits.length > 11) {
    if (digits.startsWith('549')) {
      return digits.slice(3);
    }
    return digits.slice(2);
  }
  return digits;
}

/**
 * GET /api/conversaciones
 * Devuelve todas las conversaciones de la Parrilla del usuario logueado,
 * incluyendo cada array de mensajes.
 */
const obtenerConversaciones = async (req, res) => {
  try {
    const empresaId = req.empresaId || req.parrillaId;
    if (!empresaId) {
      return res.status(400).json({ error: 'No se pudo identificar la Empresa asociada al usuario' });
    }

    const empresas = req.empresas && req.empresas.length > 0 ? req.empresas : [empresaId];
    const query = { empresaId: { $in: empresas } };

    // Paginación básica (skip/limit)
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const skip = (page - 1) * limit;

    const [conversaciones, total] = await Promise.all([
      Conversacion.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('contactoId', 'nombre telefono direccion pisoDepto codigoPostal etiquetas notas')
        .lean(),
      Conversacion.countDocuments(query)
    ]);

    // Buscar pedidos cancelados en las últimas 24h para marcarlos en la lista
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pedidosCancelados = await Pedido.find({
      empresaId: { $in: empresas },
      estado: 'Cancelado',
      updatedAt: { $gte: hace24h }
    }).lean();
    const canceladosPorConv = new Map();
    pedidosCancelados.forEach(p => {
      if (p.conversacionId) {
        canceladosPorConv.set(p.conversacionId.toString(), p);
      }
    });

    const empresasDocs = await Empresa.find({ _id: { $in: empresas } }).lean();
    const empresasInfo = empresasDocs.map(e => ({
      _id: e._id.toString(),
      nombre: e.nombre,
      whatsappPhoneId: e.whatsappPhoneId
    }));

    // Evitar N+1 consultas: traer todos los mensajes de las conversaciones de la página en una sola query
    const idsConversaciones = conversaciones.map(c => c._id);
    const mensajesPorConversacion = await Mensaje.aggregate([
      { $match: { conversacionId: { $in: idsConversaciones } } },
      { $sort: { createdAt: 1 } },
      { $group: { _id: '$conversacionId', mensajes: { $push: '$$ROOT' } } }
    ]);

    const mapaMensajes = new Map(
      mensajesPorConversacion.map(g => [String(g._id), g.mensajes])
    );

    const conversacionesConMensajes = conversaciones.map(conv => ({
      _id: conv._id,
      empresaId: conv.empresaId,
      contactoId: conv.contactoId,
      lineaReceptora: conv.lineaReceptora,
      numeroReceptor: conv.numeroReceptor || '',
      botActivo: conv.botActivo,
      estado: conv.estado,
      ultimoMensaje: conv.ultimoMensaje,
      updatedAt: conv.updatedAt,
      tieneCancelacionReciente: canceladosPorConv.has(conv._id.toString()),
      mensajes: (mapaMensajes.get(String(conv._id)) || []).map(m => ({
        _id: m._id,
        remitente: m.remitente,
        contenido: m.contenido,
        fecha: m.createdAt,
        estado: m.estado || 'enviado',
        fechaEstado: m.fechaEstado || null,
        tipo: m.tipo || 'texto',
        urlArchivo: m.urlArchivo || ''
      }))
    }));

    return res.json({
      ok: true,
      conversaciones: conversacionesConMensajes,
      empresas: empresasInfo,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error al obtener conversaciones:', error);
    return res.status(500).json({ error: 'Error interno al obtener conversaciones' });
  }
};

module.exports = {
  obtenerConversaciones
};
