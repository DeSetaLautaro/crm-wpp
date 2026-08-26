const Empresa = require('../models/Empresa');
const Cliente = require('../models/Cliente');
const Difusion = require('../models/Difusion');
const { Types } = require('mongoose');

const CONCURRENCIA_ENVIO = 10;

function normalizarTelefono(telefono) {
  let t = String(telefono || '').replace(/\D/g, '');
  if (!t) return '';
  if (t.startsWith('549') && t.length === 13) return t;
  if (t.startsWith('54')) {
    if (!t.startsWith('549')) {
      t = '549' + t.slice(2);
    }
    return t;
  }
  if (t.startsWith('9') && t.length === 11) {
    t = '549' + t.slice(1);
    return t;
  }
  if (t.startsWith('15') && t.length === 11) {
    t = '549' + t.slice(2);
    return t;
  }
  t = t.replace(/^0/, '');
  return '549' + t;
}

async function enviarTextoWhatsApp(empresa, telefono, mensaje) {
  const accessToken = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = empresa.whatsappPhoneId;
  const destino = normalizarTelefono(telefono);
  if (!accessToken || !phoneId || !destino) {
    return { ok: false, error: 'Faltan credenciales o teléfono' };
  }
  try {
    const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: destino,
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

async function obtenerOpcionesDifusion(req, res) {
  try {
    const idsEmpresas = req.empresas && req.empresas.length ? req.empresas : [req.empresaId];
    if (!idsEmpresas || idsEmpresas.length === 0) {
      return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    }
    const contactos = await Cliente.find({ empresaId: { $in: idsEmpresas } }).lean();
    const etiquetasSet = new Set();
    contactos.forEach(c => (c.etiquetas || []).forEach(e => etiquetasSet.add(e)));
    const etiquetas = Array.from(etiquetasSet).sort();
    return res.json({
      ok: true,
      contactos: contactos.map(c => ({
        _id: c._id,
        nombre: c.nombre || '',
        telefono: c.telefono,
        etiquetas: c.etiquetas || []
      })),
      etiquetas
    });
  } catch (error) {
    console.error('Error obteniendo opciones de difusión:', error);
    return res.status(500).json({ error: 'Error interno al obtener opciones' });
  }
}

async function crearDifusion(req, res) {
  try {
    const empresaId = req.body.empresaId || req.empresaId;
    if (!empresaId) return res.status(400).json({ error: 'Falta empresaId' });
    const mensaje = (req.body.mensaje || '').trim();
    if (!mensaje) return res.status(400).json({ error: 'El mensaje es obligatorio' });

    let tipos = req.body.tipoDestinatario || 'etiqueta';
    if (!Array.isArray(tipos)) {
      tipos = [tipos];
    }
    const tiposValidos = ['todos', 'etiqueta', 'manual'];
    if (!tipos.every(t => tiposValidos.includes(t))) {
      return res.status(400).json({ error: 'Tipo de destinatario inválido' });
    }
    if (tipos.length === 0) {
      return res.status(400).json({ error: 'Elegí al menos un tipo de destinatario' });
    }

    const mapContactos = new Map();
    const agregarContacto = (c) => {
      const key = c._id.toString();
      if (!mapContactos.has(key)) {
        mapContactos.set(key, { contactoId: c._id, telefono: normalizarTelefono(c.telefono), nombre: c.nombre || '' });
      }
    };

    if (tipos.includes('todos')) {
      const clientes = await Cliente.find({ empresaId }).lean();
      clientes.forEach(agregarContacto);
    }
    if (tipos.includes('etiqueta')) {
      const etiqueta = String(req.body.etiqueta || '').trim();
      if (!etiqueta) return res.status(400).json({ error: 'Elegí una etiqueta' });
      const clientes = await Cliente.find({ empresaId, etiquetas: etiqueta }).lean();
      clientes.forEach(agregarContacto);
    }
    if (tipos.includes('manual')) {
      const ids = Array.isArray(req.body.contactosIds) ? req.body.contactosIds : [];
      if (ids.length === 0) return res.status(400).json({ error: 'No se seleccionaron contactos' });
      const idsValidos = ids.filter(id => Types.ObjectId.isValid(id));
      const clientes = await Cliente.find({ _id: { $in: idsValidos }, empresaId }).lean();
      clientes.forEach(agregarContacto);
    }

    const contactos = Array.from(mapContactos.values());
    if (contactos.length === 0) {
      return res.status(400).json({ error: 'No hay contactos para la difusión' });
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

async function procesarEnvioDifusion(difusion) {
  if (difusion.estado === 'enviando') {
    throw new Error('La difusión ya está en proceso');
  }
  const empresa = await Empresa.findById(difusion.empresaId);
  if (!empresa) throw new Error('Empresa no encontrada');

  difusion.estado = 'enviando';
  difusion.fechaEnvio = new Date();
  await difusion.save();

  let enviados = 0;
  const errores = [];
  const pendientes = difusion.contactos.filter(d => d.estado !== 'enviado' && d.telefono);

  for (let i = 0; i < pendientes.length; i += CONCURRENCIA_ENVIO) {
    const lote = pendientes.slice(i, i + CONCURRENCIA_ENVIO);
    const resultados = await Promise.allSettled(
      lote.map(dest => enviarTextoWhatsApp(empresa, dest.telefono, difusion.mensaje))
    );
    resultados.forEach((r, idx) => {
      const dest = lote[idx];
      if (r.status === 'fulfilled' && r.value && r.value.ok) {
        dest.estado = 'enviado';
        enviados++;
      } else {
        dest.estado = 'error';
        const errMsg = r.status === 'rejected' ? (r.reason?.message || 'Error') : (r.value?.error || 'Error');
        errores.push({ telefono: dest.telefono, error: errMsg });
      }
    });
    difusion.destinatariosEnviados = enviados;
    difusion.errores = errores;
    await difusion.save();
  }

  difusion.estado = errores.length === 0 ? 'completada' : (enviados > 0 ? 'completada' : 'error');
  await difusion.save();
  return difusion;
}

async function enviarDifusion(req, res) {
  try {
    const difusion = await Difusion.findById(req.params.id);
    if (!difusion) return res.status(404).json({ error: 'Difusión no encontrada' });
    const idsEmpresas = req.empresas && req.empresas.length ? req.empresas : [req.empresaId];
    if (!idsEmpresas.some(e => String(e) === String(difusion.empresaId))) {
      return res.status(403).json({ error: 'No tienes acceso a esta difusión' });
    }
    const difusionProcesada = await procesarEnvioDifusion(difusion);
    const io = req.app.get('io');
    if (io) {
      io.to(String(difusion.empresaId)).emit('difusion-completada', { difusionId: difusion._id });
    }
    if (difusionProcesada.estado === 'error') {
      return res.status(502).json({
        ok: false,
        error: 'No se pudo enviar la difusión. Revisá los errores.',
        difusion: difusionProcesada,
        errores: difusionProcesada.errores || []
      });
    }
    return res.json({ ok: true, difusion: difusionProcesada, errores: difusionProcesada.errores || [] });
  } catch (error) {
    console.error('Error enviando difusión:', error);
    return res.status(500).json({ error: 'Error interno al enviar difusión' });
  }
}

async function enviarDifusionesProgramadas() {
  try {
    const ahora = new Date();
    const difusiones = await Difusion.find({
      estado: 'programada',
      fechaProgramacion: { $lte: ahora }
    }).limit(20);
    for (const difusion of difusiones) {
      try {
        await procesarEnvioDifusion(difusion);
      } catch (e) {
        console.error(`Error enviando difusión programada ${difusion._id}:`, e);
      }
    }
  } catch (error) {
    console.error('Error en cron de difusiones programadas:', error);
  }
}

module.exports = {
  listarDifusiones,
  crearDifusion,
  enviarDifusion,
  obtenerOpcionesDifusion,
  enviarDifusionesProgramadas
};
