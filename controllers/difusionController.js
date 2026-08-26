const Empresa = require('../models/Empresa');
const Cliente = require('../models/Cliente');
const Difusion = require('../models/Difusion');

async function enviarTextoWhatsApp(empresa, telefono, mensaje) {
  const accessToken = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = empresa.whatsappPhoneId;
  if (!accessToken || !phoneId || !telefono) {
    return { ok: false, error: 'Faltan credenciales o teléfono' };
  }
  try {
    const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'text',
      text: { body: mensaje }
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, error: body };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function listarDifusiones(req, res) {
  try {
    const idsEmpresas = req.empresas && req.empresas.length ? req.empresas : [req.empresaId];
    const difusiones = await Difusion.find({ empresaId: { $in: idsEmpresas } })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ ok: true, difusiones });
  } catch (error) {
    console.error('Error listando difusiones:', error);
    return res.status(500).json({ error: 'Error interno al listar difusiones' });
  }
}

async function crearDifusion(req, res) {
  try {
    const empresaId = req.body.empresaId || req.empresaId;
    if (!empresaId) return res.status(400).json({ error: 'Falta empresaId' });
    const mensaje = (req.body.mensaje || '').trim();
    if (!mensaje) return res.status(400).json({ error: 'El mensaje es obligatorio' });

    let contactos = Array.isArray(req.body.contactos) ? req.body.contactos : [];

    if (contactos.length === 0 && req.body.etiqueta) {
      const etiqueta = String(req.body.etiqueta);
      const clientes = await Cliente.find({ empresaId, etiquetas: etiqueta }).lean();
      contactos = clientes.map(c => ({
        contactoId: c._id,
        telefono: c.telefono,
        nombre: c.nombre || ''
      }));
    }

    if (contactos.length === 0) {
      return res.status(400).json({ error: 'No se seleccionaron contactos' });
    }

    const fechaProgramacion = req.body.fechaProgramacion ? new Date(req.body.fechaProgramacion) : null;
    const difusion = await Difusion.create({
      empresaId,
      usuarioAppId: String(req.usuario.id || ''),
      mensaje,
      contactos: contactos.map(c => ({
        contactoId: c.contactoId || null,
        telefono: String(c.telefono || ''),
        nombre: c.nombre || ''
      })),
      estado: fechaProgramacion && fechaProgramacion > new Date() ? 'programada' : 'borrador',
      fechaProgramacion,
      destinatariosTotal: contactos.length
    });
    return res.status(201).json({ ok: true, difusion });
  } catch (error) {
    console.error('Error creando difusión:', error);
    return res.status(500).json({ error: 'Error interno al crear difusión' });
  }
}

async function enviarDifusion(req, res) {
  try {
    const difusion = await Difusion.findById(req.params.id);
    if (!difusion) return res.status(404).json({ error: 'Difusión no encontrada' });
    const idsEmpresas = req.empresas && req.empresas.length ? req.empresas : [req.empresaId];
    if (!idsEmpresas.some(e => String(e) === String(difusion.empresaId))) {
      return res.status(403).json({ error: 'No tienes acceso a esta difusión' });
    }
    const empresa = await Empresa.findById(difusion.empresaId);
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    if (difusion.estado === 'enviando') {
      return res.status(409).json({ error: 'La difusión ya está en proceso' });
    }

    difusion.estado = 'enviando';
    difusion.fechaEnvio = new Date();
    await difusion.save();

    let enviados = 0;
    const errores = [];
    for (const dest of difusion.contactos) {
      if (!dest.telefono) continue;
      const resultado = await enviarTextoWhatsApp(empresa, dest.telefono, difusion.mensaje);
      if (resultado.ok) {
        dest.estado = 'enviado';
        enviados++;
      } else {
        dest.estado = 'error';
        errores.push({ telefono: dest.telefono, error: resultado.error });
      }
    }
    difusion.destinatariosEnviados = enviados;
    difusion.errores = errores;
    difusion.estado = errores.length === 0 ? 'completada' : (enviados > 0 ? 'completada' : 'error');
    await difusion.save();
    const io = req.app.get('io');
    if (io) {
      io.to(String(difusion.empresaId)).emit('difusion-completada', { difusionId: difusion._id });
    }
    return res.json({ ok: true, difusion });
  } catch (error) {
    console.error('Error enviando difusión:', error);
    return res.status(500).json({ error: 'Error interno al enviar difusión' });
  }
}

async function obtenerContactosPorEtiqueta(req, res) {
  try {
    const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
    const etiqueta = req.query.etiqueta || '';
    if (!empresaId) return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    if (!etiqueta) return res.json({ contactos: [] });
    const clientes = await Cliente.find({ empresaId, etiquetas: etiqueta }).lean();
    return res.json({ ok: true, contactos: clientes.map(c => ({
      contactoId: c._id,
      telefono: c.telefono,
      nombre: c.nombre || ''
    })) });
  } catch (error) {
    console.error('Error obteniendo contactos por etiqueta:', error);
    return res.status(500).json({ error: 'Error interno al obtener contactos' });
  }
}

module.exports = {
  listarDifusiones,
  crearDifusion,
  enviarDifusion,
  obtenerContactosPorEtiqueta
};
