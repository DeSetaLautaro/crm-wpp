const { GoogleGenerativeAI } = require("@google/generative-ai");
const Empresa = require('../models/Empresa');
const Contacto = require('../models/Contacto');
const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');
const Producto = require('../models/Producto');

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
    console.log("🔔 [1] ¡DING DONG! Facebook mandó algo al webhook");

    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value) {
        console.log("🛑 [2] Falla: No hay 'value' en el mensaje de Facebook.");
        return res.sendStatus(200);
    }

    const metadata = value?.metadata || {};
    const whatsappPhoneId = metadata?.phone_number_id || metadata?.display_phone_number || '';
    const mensaje = value?.messages?.[0];

    if (!mensaje) {
        console.log("🛑 [2] Falla: Es una actualización de estado (ej. mensaje leído), no es un mensaje de texto.");
        return res.sendStatus(200);
    }

    const telefonoCliente = mensaje?.from || '';
    const textoMensaje = mensaje?.text?.body || '';

    console.log(`🔍 [3] Datos extraídos -> Cliente: ${telefonoCliente} | Mi Local ID: ${whatsappPhoneId} | Texto: ${textoMensaje}`);

    if (!whatsappPhoneId || !telefonoCliente || !textoMensaje) {
      console.log("🛑 [4] Falla: Faltan datos clave (Teléfono, ID o Texto).");
      return res.sendStatus(200);
    }

    console.log(`⚙️ [5] Buscando empresa en MongoDB con whatsappPhoneId: '${whatsappPhoneId}'`);
    const empresa = await Empresa.findOne({ whatsappPhoneId: whatsappPhoneId });
    
    if (!empresa) {
        console.log("❌ [ERROR GRAVE] La base de datos no encontró ninguna empresa con ese número de ID.");
        return res.sendStatus(200);
    }
    console.log(`🏢 [6] ¡Empresa encontrada!: ${empresa.nombre}`);
    
    const productos = await Producto.find({ empresaId: empresa._id }).lean();

    let contacto = await Contacto.findOne({ empresaId: empresa._id, telefono: telefonoCliente });
    if (!contacto) {
      console.log("👤 [7] Creando nuevo contacto...");
      contacto = await Contacto.create({ empresaId: empresa._id, telefono: telefonoCliente, nombre: '' });
    }

    let conversacion = await Conversacion.findOne({ empresaId: empresa._id, contactoId: contacto._id, estado: 'Abierto' });
    if (!conversacion) {
      console.log("💬 [8] Creando nueva conversación...");
      conversacion = await Conversacion.create({
        empresaId: empresa._id,
        contactoId: contacto._id,
        lineaReceptora: whatsappPhoneId,
        botActivo: true,
        estado: 'Abierto',
        ultimoMensaje: textoMensaje
      });
    }

    console.log("📝 [9] Guardando mensaje...");
    await Mensaje.create({
      conversacionId: conversacion._id,
      remitente: 'cliente',
      contenido: textoMensaje
    });

    await Conversacion.findByIdAndUpdate(conversacion._id, { ultimoMensaje: textoMensaje });

    // Emitir mensaje entrante a los clientes conectados
    const io = req.app.get('io');
    if (io) {
      io.to(empresa._id.toString()).emit('mensaje-nuevo', {
        conversacionId: conversacion._id,
        mensaje: {
          remitente: 'cliente',
          contenido: textoMensaje,
          fecha: new Date()
        },
        conversacion: {
          _id: conversacion._id,
          ultimoMensaje: textoMensaje,
          updatedAt: new Date()
        }
      });
    }

    // ===== Generar respuesta con Gemini =====
    let respuestaIA = null;

    if (process.env.GEMINI_API_KEY) {
      try {
        const menuTexto = productos.length
          ? productos.map(p => {
              const detalleExtras = p.toppings?.length ? ` (extras: ${p.toppings.join(', ')})` : '';
              return `- ${p.nombre} ($${p.precio})${detalleExtras}`;
            }).join('\n')
          : 'No hay productos cargados en el catálogo.';

        const prompt = `Sos el asistente virtual de ${empresa.nombre}. Respondé de forma breve y amable a los clientes.

Catálogo actual:
${menuTexto}

Mensaje del cliente: "${textoMensaje}"

Redactá una respuesta que sea útil para el cliente, indicando precios y opciones disponibles. Si no encontrás la información en el catálogo, ofrecé contactar a un humano.`;

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

        const result = await model.generateContent(prompt);
        respuestaIA = result.response.text().trim();
      } catch (err) {
        console.error("❌ Error al generar respuesta con Gemini:", err);
      }
    }

    if (respuestaIA) {
      await Mensaje.create({
        conversacionId: conversacion._id,
        remitente: 'ia',
        contenido: respuestaIA
      });

      await Conversacion.findByIdAndUpdate(conversacion._id, { ultimoMensaje: respuestaIA });

      const io = req.app.get('io');
      if (io) {
        io.to(empresa._id.toString()).emit('mensaje-nuevo', {
          conversacionId: conversacion._id,
          mensaje: {
            remitente: 'ia',
            contenido: respuestaIA,
            fecha: new Date()
          },
          conversacion: {
            _id: conversacion._id,
            ultimoMensaje: respuestaIA,
            updatedAt: new Date()
          }
        });
      }
    }

    console.log("✅ [10] ¡ÉXITO! Mensaje guardado perfectamente en MongoDB.");
    return res.sendStatus(200);
  } catch (error) {
    console.error('🔥 [ERROR CATASTRÓFICO] Explotó el código en el Try/Catch:', error);
    return res.sendStatus(200);
  }
};

// ===== Enviar mensaje desde el dashboard =====
const enviarMensaje = async (req, res) => {
  try {
    const { conversacionId, mensaje } = req.body || {};
    if (!conversacionId || !mensaje || typeof mensaje !== 'string' || mensaje.length === 0) {
      return res.status(400).json({ error: 'Faltan datos: conversacionId y mensaje son requeridos' });
    }

    const conversacion = await Conversacion.findById(conversacionId)
      .populate('empresaId')
      .populate('contactoId');
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    const empresaId = conversacion.empresaId?._id || conversacion.empresaId;
    const empresaIdStr = empresaId ? empresaId.toString() : '';
    const reqEmpresaId = req.parrillaId ? String(req.parrillaId) : '';
    if (reqEmpresaId && empresaIdStr !== reqEmpresaId) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const empresa = conversacion.empresaId;
    const contacto = conversacion.contactoId;

    const telefonoCliente = contacto?.telefono;
    const whatsappPhoneId = empresa?.whatsappPhoneId;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!whatsappPhoneId || !telefonoCliente) {
      return res.status(500).json({ error: 'Faltan datos de empresa o contacto para enviar el mensaje' });
    }

    let enviado = false;
    let respuestaWhatsApp = null;
    if (accessToken) {
      const url = `https://graph.facebook.com/v19.0/${whatsappPhoneId}/messages`;
      const payload = {
        messaging_product: 'whatsapp',
        to: telefonoCliente,
        type: 'text',
        text: { body: mensaje }
      };
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        respuestaWhatsApp = await resp.json();
        if (resp.ok) {
          enviado = true;
        } else {
          console.error('Error al enviar a WhatsApp:', respuestaWhatsApp);
        }
      } catch (error) {
        console.error('Error de red enviando a la Graph API:', error);
        return res.status(502).json({ error: 'No se pudo comunicar con WhatsApp' });
      }
    } else {
      // Sin token configurado, simulamos envío exitoso para desarrollo
      enviado = true;
    }

    if (!enviado) {
      return res.status(502).json({ error: 'El envío a WhatsApp falló', detalle: respuestaWhatsApp });
    }

    const nuevoMensaje = await Mensaje.create({
      conversacionId: conversacion._id,
      remitente: 'empresa',
      contenido: mensaje
    });

    await Conversacion.findByIdAndUpdate(conversacion._id, { ultimoMensaje: mensaje });

    const io = req.app.get('io');
    if (io) {
      io.to(empresaIdStr).emit('mensaje-nuevo', {
        conversacionId: conversacion._id,
        mensaje: {
          remitente: 'empresa',
          contenido: mensaje,
          fecha: new Date()
        },
        conversacion: {
          _id: conversacion._id,
          ultimoMensaje: mensaje,
          updatedAt: new Date()
        }
      });
    }

    return res.json({
      ok: true,
      mensaje: {
        _id: nuevoMensaje._id,
        remitente: nuevoMensaje.remitente,
        contenido: nuevoMensaje.contenido,
        fecha: nuevoMensaje.createdAt
      }
    });
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    return res.status(500).json({ error: 'Error interno al enviar mensaje' });
  }
};

module.exports = {
  verificarWebhook,
  recibirMensaje,
  enviarMensaje
};
