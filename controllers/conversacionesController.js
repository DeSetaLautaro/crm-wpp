const mongoose = require('mongoose');
const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');
const Cliente = require('../models/Cliente');
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

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const skip = (page - 1) * limit;

    const [conversacionesAgg, total] = await Promise.all([
      Conversacion.aggregate([
        { $match: query },
        { $sort: { _id: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'mensajes',
            let: { convId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$conversacionId', '$$convId'] } } },
              { $sort: { _id: -1 } },
              { $limit: 50 },
              { $project: { _id: 1, remitente: 1, contenido: 1, createdAt: 1, estado: 1, fechaEstado: 1, tipo: 1, urlArchivo: 1 } }
            ],
            as: 'mensajes'
          }
        }
      ]),
      Conversacion.countDocuments(query)
    ]);

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

    // Cargar contactos presentes en esta página
    const idsContactos = conversacionesAgg.map(c => c.contactoId).filter(Boolean);
    const contactos = await Cliente.find({ _id: { $in: idsContactos } }).lean();
    const mapaContactos = new Map(contactos.map(c => [String(c._id), c]));

    const conversacionesConMensajes = conversacionesAgg.map(conv => {
      const contacto = mapaContactos.get(String(conv.contactoId)) || {};
      const mensajesDesc = Array.isArray(conv.mensajes) ? conv.mensajes : [];
      const mensajesAsc = mensajesDesc.slice().reverse();
      const tieneMas = mensajesAsc.length === 50;
      return {
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
        tieneMas,
        mensajes: mensajesAsc.map(m => ({
          _id: m._id,
          remitente: m.remitente,
          contenido: m.contenido,
          fecha: m.createdAt,
          estado: m.estado || 'enviado',
          fechaEstado: m.fechaEstado || null,
          tipo: m.tipo || 'texto',
          urlArchivo: m.urlArchivo || ''
        }))
      };
    });

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

const obtenerMensajesConversacion = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const before = req.query.before || null;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID de conversación inválido' });
    }

    const conversacion = await Conversacion.findById(id);
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    const empresaIdStr = conversacion.empresaId.toString();
    const empresasPermitidas = req.empresas || [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const filtro = { conversacionId: id };
    if (before) {
      if (!mongoose.Types.ObjectId.isValid(before)) {
        return res.status(400).json({ error: 'ID de mensaje inválido' });
      }
      filtro._id = { $lt: mongoose.Types.ObjectId(before) };
    }

    const mensajes = await Mensaje.find(filtro)
      .sort({ _id: -1 })
      .limit(limit)
      .lean();

    const hasMore = mensajes.length === limit;
    mensajes.reverse();

    return res.json({
      ok: true,
      mensajes: mensajes.map(m => ({
        _id: m._id,
        remitente: m.remitente,
        contenido: m.contenido,
        fecha: m.createdAt,
        estado: m.estado || 'enviado',
        fechaEstado: m.fechaEstado || null,
        tipo: m.tipo || 'texto',
        urlArchivo: m.urlArchivo || ''
      })),
      hasMore,
      total: mensajes.length
    });
  } catch (error) {
    console.error('Error al obtener mensajes de conversación:', error);
    return res.status(500).json({ error: 'Error interno al obtener mensajes' });
  }
};

const buscarMensajes = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Falta el parámetro q' });
    }

    const empresas = req.empresas && req.empresas.length > 0 ? req.empresas : [];
    if (!empresas.length) {
      return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const conversaciones = await Conversacion.aggregate([
      { $match: { empresaId: { $in: empresas } } },
      {
        $lookup: {
          from: 'mensajes',
          let: { convId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$conversacionId', '$$convId'] } } },
            { $match: { contenido: { $regex: escaped, $options: 'i' } } },
            { $sort: { _id: -1 } },
            { $limit: 5 },
            { $project: { _id: 1, remitente: 1, contenido: 1, createdAt: 1, tipo: 1, urlArchivo: 1, estado: 1 } }
          ],
          as: 'mensajesMatch'
        }
      },
      { $match: { 'mensajesMatch.0': { $exists: true } } },
      {
        $lookup: {
          from: 'clientes',
          localField: 'contactoId',
          foreignField: '_id',
          as: 'contacto'
        }
      },
      { $unwind: { path: '$contacto', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          empresaId: 1,
          contactoId: 1,
          lineaReceptora: 1,
          numeroReceptor: 1,
          botActivo: 1,
          estado: 1,
          ultimoMensaje: 1,
          updatedAt: 1,
          contacto: { _id: 1, nombre: 1, telefono: 1, etiquetas: 1 },
          mensajes: '$mensajesMatch'
        }
      }
    ]);

    return res.json({ ok: true, conversaciones });
  } catch (error) {
    console.error('Error al buscar mensajes:', error);
    return res.status(500).json({ error: 'Error interno al buscar mensajes' });
  }
};

module.exports = {
  obtenerConversaciones,
  obtenerMensajesConversacion,
  buscarMensajes
};
