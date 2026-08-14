const Empresa = require('../models/Empresa');
const Contacto = require('../models/Contacto');
const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');

const verificarWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

const recibirMensaje = async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value) return res.sendStatus(200);

    const metadata = value?.metadata || {};

    // ID del número de WhatsApp que recibió el mensaje
    const whatsappPhoneId = metadata?.phone_number_id || metadata?.display_phone_number || '';
    const mensaje = value?.messages?.[0];

    // Si no hay mensaje (ej: actualización de estado), ignoramos
    if (!mensaje) return res.sendStatus(200);

    const telefonoCliente = mensaje?.from || '';
    const textoMensaje = mensaje?.text?.body || '';

    if (!whatsappPhoneId || !telefonoCliente || !textoMensaje) {
      return res.sendStatus(200);
    }

    // Buscar la empresa dueña de esa línea
    const empresa = await Empresa.findOne({ whatsappPhoneId });
    if (!empresa) return res.sendStatus(200);

    // Buscar o crear el contacto del cliente
    let contacto = await Contacto.findOne({
      empresaId: empresa._id,
      telefono: telefonoCliente
    });

    if (!contacto) {
      contacto = await Contacto.create({
        empresaId: empresa._id,
        telefono: telefonoCliente,
        nombre: ''
      });
    }

    // Buscar una conversación abierta existente, o crear una nueva con bot activo
    let conversacion = await Conversacion.findOne({
      empresaId: empresa._id,
      contactoId: contacto._id,
      estado: 'Abierto'
    });

    if (!conversacion) {
      conversacion = await Conversacion.create({
        empresaId: empresa._id,
        contactoId: contacto._id,
        lineaReceptora: whatsappPhoneId,
        botActivo: true,
        estado: 'Abierto',
        ultimoMensaje: textoMensaje
      });
    }

    // Guardar el mensaje del cliente
    await Mensaje.create({
      conversacionId: conversacion._id,
      remitente: 'cliente',
      contenido: textoMensaje
    });

    // Actualizar último mensaje en la conversación
    await Conversacion.findByIdAndUpdate(conversacion._id, {
      ultimoMensaje: textoMensaje
    });

    // Devolvemos 200 siempre para confirmar a Meta que recibimos el evento
    return res.sendStatus(200);
  } catch (error) {
    console.error('Error en recibirMensaje:', error);
    // Aunque haya error, Meta debe recibir 200 para no reintentar infinitamente
    return res.sendStatus(200);
  }
};

module.exports = {
  verificarWebhook,
  recibirMensaje
};
