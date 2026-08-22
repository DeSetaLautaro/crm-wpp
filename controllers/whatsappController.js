const { generarTexto } = require('../services/iaService');
const mongoose = require('mongoose');
const Empresa = require('../models/Empresa');
const Cliente = require('../models/Cliente');
const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');
const Producto = require('../models/Producto');
const Usuario = require('../models/usuario');
const Pedido = require('../models/Pedido');
const { guardarPedidoConfirmado } = require('./pedidosController');

async function procesarCarrito(empresa, conversacion, texto, productos) {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const menu = productos.map(p => `- ${p.nombre} ($${p.precio})`).join('\n');
    const prompt = `Actúa como sistema de punto de venta. El cliente escribió: "${texto}".
      Interpretá el pedido y devolvé un JSON con la estructura:
      {
        "items": [
          {"nombre": "...", "cantidad": 2, "precioUnitario": 10}
        ],
        "total": 20
      }
      Si el mensaje no hace referencia a ningún ítem, devolvé null.
      Catálogo:\n${menu}
      Respuesta JSON:`;
    const raw = (await generarTexto(prompt) || '').trim().replace(/```json/g, '').replace(/```/g, '').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const data = JSON.parse(raw.substring(start, end + 1));
    if (!data || !Array.isArray(data.items)) return null;
    return { items: data.items, total: Number(data.total) || 0 };
  } catch (error) {
    console.error('⚠️ Error al procesar carrito:', error);
    return null;
  }
}

function detectarConfirmacionPedido(texto) {
  const lower = texto.toLowerCase();
  const confirmaciones = ['confirmo', 'confirmar', 'confirmado', 'dale', 'si, quiero', 'sí, quiero', 'si quiero', 'sí quiero', 'hago el pedido', 'ok, pago', 'vamos'];
  return confirmaciones.some(p => lower.includes(p));
}

function detectarMetodoPago(texto) {
  const lower = (texto || '').toLowerCase();
  if (/(efectivo|contado|billete|cash)/.test(lower)) return 'efectivo';
  if (/(transferencia|transferir|alias|cbu|depósito|deposito)/.test(lower)) return 'transferencia';
  if (/(tarjeta|débito|debito|crédito|credito|mercado pago|mercadopago)/.test(lower)) return 'tarjeta';
  return null;
}

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
  // 1. Verificamos que 'contacts' exista y tenga al menos un elemento
    const contact = value?.contacts?.[0];
    // 2. Extraemos el nombre de forma segura (si no viene, le ponemos 'Cliente' por defecto)
    const nombre = contact?.profile?.name || 'Cliente';    
    const whatsappPhoneId = metadata?.phone_number_id || metadata?.display_phone_number || '';
    const displayPhoneNumber = metadata?.display_phone_number || '';
    const mensaje = value?.messages?.[0];

    if (!mensaje) {
        console.log("🛑 [2] Falla: Es una actualización de estado (ej. mensaje leído), no es un mensaje de texto.");
        return res.sendStatus(200);
    }

    const telefonoCliente = mensaje?.from || '';
    const textoMensaje = mensaje?.text?.body || '';

    const whatsappMsgId = mensaje?.id || '';
    const t0 = performance.now();

    console.log(`🔍 [3] Datos extraídos -> Cliente: ${telefonoCliente} | Mi Local ID: ${whatsappPhoneId} | Texto: ${textoMensaje}`);

    if (!whatsappPhoneId || !telefonoCliente || !textoMensaje) {
      console.log("🛑 [4] Falla: Faltan datos clave (Teléfono, ID o Texto).");
      return res.sendStatus(200);
    }

    // Deduplicación: si ya procesamos este mensaje, no volver a hacerlo
    if (whatsappMsgId) {
      const yaProcesado = await Mensaje.findOne({ whatsappMsgId });
      if (yaProcesado) {
        console.log(`🔁 Mensaje duplicado ${whatsappMsgId} ignorado.`);
        return res.sendStatus(200);
      }
    }

    // Responder inmediatamente a Meta para evitar reintentos
    res.sendStatus(200);

    console.log(`⚙️ [5] Buscando empresa en MongoDB con whatsappPhoneId: '${whatsappPhoneId}'`);
    const empresa = await Empresa.findOne({ whatsappPhoneId: whatsappPhoneId });
    
    if (!empresa) {
        console.log("❌ [ERROR GRAVE] La base de datos no encontró ninguna empresa con ese número de ID.");
        return res.sendStatus(200);
    }
    console.log(`🏢 [6] ¡Empresa encontrada!: ${empresa.nombre}`);
    
    // Buscar el Usuario que posee la empresa para obtener sus platos
    const usuario = await Usuario.findById(empresa.usuarioAppId).lean();
    const productos = usuario?.platos || [];

    let contacto = await Cliente.findOne({ empresaId: empresa._id, telefono: telefonoCliente });
    if (!contacto) {
      console.log("👤 [7] Creando nuevo cliente...");
      contacto = await Cliente.create({ localId: usuario._id, empresaId: empresa._id, telefono: telefonoCliente, nombre: nombre });
    }

    // 🚫 Si el cliente está bloqueado, descartamos el mensaje por completo
    if (contacto.bloqueado) {
      console.log(`🚫 Cliente bloqueado (${telefonoCliente}), se descarta mensaje.`);
      return;
    }

    let conversacion = await Conversacion.findOne({ empresaId: empresa._id, contactoId: contacto._id })
      .sort({ createdAt: -1 });
    if (!conversacion) {
      console.log("💬 [8] Creando nueva conversación...");
      conversacion = await Conversacion.create({
        empresaId: empresa._id,
        contactoId: contacto._id,
        lineaReceptora: whatsappPhoneId,
        numeroReceptor: displayPhoneNumber,
        botActivo: empresa.botActivo !== false,
        estado: 'Abierto',
        ultimoMensaje: textoMensaje
      });
    } else if (conversacion.estado !== 'Abierto') {
      conversacion.estado = 'Abierto';
      await conversacion.save();
    }

    console.log("📝 [9] Guardando mensaje...");
    await Mensaje.create({
      conversacionId: conversacion._id,
      remitente: 'cliente',
      contenido: textoMensaje,
      whatsappMsgId
    });

    await Conversacion.findByIdAndUpdate(conversacion._id, {
      $set: {
        ultimoMensaje: textoMensaje,
        numeroReceptor: displayPhoneNumber
      }
    });

    // Emitir el mensaje entrante ANTES de procesar el carrito para que el panel lo muestre al instante
    const ioEntrante = req.app.get('io');
    if (ioEntrante) {
      ioEntrante.to(empresa._id.toString()).emit('mensaje-nuevo', {
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

    console.log(`⏱️ Tiempo hasta mensaje guardado: ${(performance.now() - t0).toFixed(0)} ms`);

    // ===== Procesar carrito en vivo (después de mostrar el mensaje) =====
    const carritoProcesado = await procesarCarrito(empresa, conversacion, textoMensaje, productos);
    if (carritoProcesado) {
      conversacion.carrito = carritoProcesado.items;
      conversacion.carritoTotal = carritoProcesado.total;
      await Conversacion.findByIdAndUpdate(conversacion._id, {
        $set: {
          carrito: carritoProcesado.items,
          carritoTotal: carritoProcesado.total
        }
      });
      const ioCarrito = req.app.get('io');
      if (ioCarrito) {
        ioCarrito.to(empresa._id.toString()).emit('carrito-actualizado', {
          conversacionId: conversacion._id,
          carrito: carritoProcesado.items,
          total: carritoProcesado.total
        });
      }
    }

    // ===== Extracción automática de datos del cliente con IA =====
    try {
      if (process.env.GEMINI_API_KEY) {
        const promptExtract = `Analizá el siguiente mensaje de un cliente. Si contiene una dirección física (calle y número), indicála en el campo "direccion". Si contiene un piso o departamento, indicálo en el campo "pisoDepto". Si contiene un código postal o localidad, indicálo en el campo "codigoPostal". Respondé solo con un JSON válido con estos tres campos, usando string vacío cuando no se encuentre el dato.

Mensaje: "${textoMensaje}"

JSON:`;

        const rawText = (await generarTexto(promptExtract) || '').trim().replace(/```json/g, '').replace(/```/g, '').trim();
        const startIdx = rawText.indexOf('{');
        const endIdx = rawText.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          const jsonStr = rawText.substring(startIdx, endIdx + 1);
          const data = JSON.parse(jsonStr);
          if (data && data.direccion && typeof data.direccion === 'string') {
            await Cliente.findByIdAndUpdate(contacto._id, { $set: { direccion: data.direccion } });
          }
          if (data && data.pisoDepto && typeof data.pisoDepto === 'string') {
            await Cliente.findByIdAndUpdate(contacto._id, { $set: { pisoDepto: data.pisoDepto } });
          }
          if (data && data.codigoPostal && typeof data.codigoPostal === 'string') {
            await Cliente.findByIdAndUpdate(contacto._id, { $set: { codigoPostal: data.codigoPostal } });
          }
        }
      } else {
        // Sin API key de Gemini, no se extrae información automáticamente
      }
    } catch (error) {
      console.error('⚠️ Error al extraer datos del cliente con IA:', error);
    }

    console.log(`⏱️ Tiempo extracción IA: ${(performance.now() - t0).toFixed(0)} ms`);

    // ===== Generar respuesta con Gemini (solo si el bot está activo) =====
    let respuestaIA = null;

    const botHabilitado = (empresa.botActivo !== false);

    if (botHabilitado && process.env.GEMINI_API_KEY) {
      try {
        const menuTexto = productos.length
          ? productos.map(p => {
              let detalleExtras = '';
              if (p.toppings && p.toppings.length > 0) {
                detalleExtras = p.toppings.map(g => {
                  const opciones = Array.isArray(g.opciones) ? g.opciones.join(', ') : '';
                  return `${g.grupo || ''}: ${opciones}`.trim();
                }).filter(Boolean).join('; ');
                detalleExtras = ` (extras: ${detalleExtras})`;
              }
              return `- ${p.nombre} ($${p.precio})${detalleExtras}`;
            }).join('\n')
          : 'No hay productos cargados en el catálogo.';

        // Obtener últimos mensajes para dar contexto a la IA
        const historialMensajes = await Mensaje.find({ conversacionId: conversacion._id })
          .sort({ createdAt: -1 })
          .limit(12)
          .lean();
        const historialTexto = historialMensajes.reverse().map(m => {
          const autor = m.remitente === 'cliente' ? 'Cliente' : (m.remitente === 'ia' || m.remitente === 'bot' ? 'Bot' : 'Sistema');
          return `${autor}: ${m.contenido}`;
        }).join('\n');

        const prompt = `Sos el asistente virtual de ${empresa.nombre}. Respondé de forma breve y amable a los clientes.

Reglas obligatorias:
- SIEMPRE pedí la dirección de entrega completa si todavía no la dio. No confirmes un pedido sin dirección.
- Preguntá cómo quiere pagar: efectivo o transferencia.
- No seas insistente con agregar productos. Si el cliente ya pidió o dijo que no quiere nada más, no vuelvas a ofrecerle más cosas.
- Si no encontrás la información en el catálogo, ofrecé contactar a un humano.

Catálogo actual:
${menuTexto}

Historial reciente:
${historialTexto}

Mensaje del cliente: "${textoMensaje}"

Redactá una respuesta que sea útil para el cliente, indicando precios y opciones disponibles. Si el cliente está por confirmar un pedido y todavía no dio dirección, pedísela sí o sí antes de confirmar.`;

        respuestaIA = await generarTexto(prompt);
      } catch (err) {
        console.error("❌ Error al generar respuesta con Gemini:", err);
      }
    }

    if (respuestaIA) {
      // Enviar la respuesta al cliente por WhatsApp
      const phoneNumberId = metadata?.phone_number_id || whatsappPhoneId;
      const accessToken = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;

      if (accessToken) {
        try {
          const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
          const payload = {
            messaging_product: 'whatsapp',
            to: telefonoCliente,
            type: 'text',
            text: { body: respuestaIA }
          };

          console.log(`📤 Enviando respuesta IA al teléfono ${telefonoCliente} usando phoneNumberId ${phoneNumberId}`);

          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const respBody = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            console.error('❌ Error al enviar respuesta IA a WhatsApp:', resp.status, respBody);
          } else {
            console.log('✅ Respuesta IA enviada a WhatsApp correctamente');
          }
        } catch (error) {
          console.error('❌ Error de red al enviar respuesta IA a WhatsApp:', error);
        }
      } else {
        console.log('⚠️ Sin tokenMeta ni WHATSAPP_ACCESS_TOKEN, la respuesta IA no se envió al cliente');
      }

      // Guardar mensaje en la base de datos
      await Mensaje.create({
        conversacionId: conversacion._id,
        remitente: 'ia',
        contenido: respuestaIA
      });

      await Conversacion.findByIdAndUpdate(conversacion._id, { ultimoMensaje: respuestaIA });

      // ===== Guardar pedido si el cliente confirmó la orden =====
      try {
        if (detectarConfirmacionPedido(textoMensaje) && contacto.direccion && contacto.direccion.trim() !== '') {
          const carritoActual = conversacion.carrito || [];
          if (carritoActual.length > 0) {
            const totalCarrito = (conversacion.carritoTotal || 0) ||
              carritoActual.reduce((sum, it) => sum + (it.cantidad * it.precioUnitario), 0);

            // Detectar método de pago mencionado en los últimos mensajes
            let metodoPago = 'Pendiente';
            try {
              const ultimosMsgs = await Mensaje.find({ conversacionId: conversacion._id })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();
              for (const msg of ultimosMsgs) {
                const det = detectarMetodoPago(msg.contenido);
                if (det) {
                  metodoPago = det;
                  break;
                }
              }
            } catch (e) {
              console.warn('⚠️ No se pudo detectar método de pago:', e);
            }

            await guardarPedidoConfirmado({
              localId: usuario._id,
              empresaId: empresa._id,
              contactoId: contacto._id,
              cliente: contacto.nombre || nombre,
              telefonoCliente: contacto.telefono,
              items: carritoActual,
              total: totalCarrito,
              metodoPago,
              estado: 'confirmado',
              direccion: contacto.direccion || '',
              notas: '',
              fechaTurno: '',
              fecha: new Date()
            });

            // Limpiar carrito después de confirmar
            await Conversacion.findByIdAndUpdate(conversacion._id, {
              $set: { carrito: [], carritoTotal: 0 }
            });
            conversacion.carrito = [];
            conversacion.carritoTotal = 0;
            const ioCarrito2 = req.app.get('io');
            if (ioCarrito2) {
              ioCarrito2.to(empresa._id.toString()).emit('carrito-actualizado', {
                conversacionId: conversacion._id,
                carrito: [],
                total: 0
              });
            }
            console.log(`✅ [PEDIDO] Pedido guardado para el cliente ${contacto.telefono}`);
          } else {
            console.log(`ℹ️ [PEDIDO] El cliente confirmó pero no hay items en el carrito`);
          }
        }
      } catch (error) {
        console.error('❌ Error al guardar pedido en BD:', error);
      }

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
    return;
  } catch (error) {
    console.error('🔥 [ERROR CATASTRÓFICO] Explotó el código en el Try/Catch:', error);
    return;
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
    const empresasPermitidas = req.empresas && req.empresas.length > 0 ? req.empresas : [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
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

    await Conversacion.findByIdAndUpdate(conversacion._id, { ultimoMensaje: mensaje, estado: 'Abierto' });

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

// ===== Actualizar botActivo de la empresa =====
const actualizarBotActivo = async (req, res) => {
  try {
    const { botActivo } = req.body || {};
    if (typeof botActivo !== 'boolean') {
      return res.status(400).json({ error: 'botActivo debe ser un booleano' });
    }

    const idsEmpresas = (req.empresas && req.empresas.length > 0)
      ? req.empresas
      : (req.parrillaId || req.empresaId ? [req.parrillaId || req.empresaId] : []);
    if (idsEmpresas.length === 0) {
      return res.status(400).json({ error: 'No se identificó la empresa' });
    }

    const resultado = await Empresa.updateMany(
      { _id: { $in: idsEmpresas } },
      { $set: { botActivo } }
    );

    if (resultado.matchedCount === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    await Conversacion.updateMany(
      { empresaId: { $in: idsEmpresas } },
      { $set: { botActivo } }
    );

    return res.json({ ok: true, botActivo });
  } catch (error) {
    console.error('Error al actualizar botActivo:', error);
    return res.status(500).json({ error: 'Error interno al actualizar botActivo' });
  }
};

// ===== Actualizar datos manuales del cliente =====
const actualizarContacto = async (req, res) => {
  try {
    const { contactoId } = req.params;
    const { direccion, pisoDepto, codigoPostal } = req.body || {};

    const updates = {};
    if (typeof direccion === 'string') updates.direccion = direccion;
    if (typeof pisoDepto === 'string') updates.pisoDepto = pisoDepto;
    if (typeof codigoPostal === 'string') updates.codigoPostal = codigoPostal;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Debes enviar al menos direccion, pisoDepto o codigoPostal' });
    }

    const contacto = await Cliente.findByIdAndUpdate(
      contactoId,
      { $set: updates },
      { new: true }
    );

    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    return res.json({ ok: true, contacto });
  } catch (error) {
    console.error('Error al actualizar contacto:', error);
    return res.status(500).json({ error: 'Error interno al actualizar contacto' });
  }
};

// ===== Obtener pedido activo / último pedido de una conversación =====
const obtenerPedidoActivo = async (req, res) => {
  try {
    const { conversacionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(conversacionId)) {
      return res.status(400).json({ error: 'ID de conversación inválido' });
    }
    const conversacion = await Conversacion.findById(conversacionId);
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    const empresaIdStr = conversacion.empresaId.toString();
    const empresasPermitidas = req.empresas && req.empresas.length > 0 ? req.empresas : [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const pedido = await Pedido.findOne({
      conversacionId,
      empresaId: conversacion.empresaId,
      contactoId: conversacion.contactoId,
      estado: { $nin: ['Entregado', 'Cancelado'] }
    }).sort({ createdAt: -1 });

    return res.json({ ok: true, pedido });
  } catch (error) {
    console.error('Error al obtener pedido activo:', error);
    return res.status(500).json({ error: 'Error interno al obtener pedido activo' });
  }
};

const marcarAtendido = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID de conversación inválido' });
    }
    const conversacion = await Conversacion.findById(id);
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    const empresaIdStr = conversacion.empresaId.toString();
    const empresasPermitidas = req.empresas && req.empresas.length > 0 ? req.empresas : [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }
    conversacion.estado = 'Resuelto';
    await conversacion.save();
    return res.json({ ok: true, conversacion });
  } catch (error) {
    console.error('Error al marcar atendido:', error);
    return res.status(500).json({ error: 'Error interno al marcar atendido' });
  }
};

const reabrirConversacion = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID de conversación inválido' });
    }
    const conversacion = await Conversacion.findById(id);
    if (!conversacion) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    const empresaIdStr = conversacion.empresaId.toString();
    const empresasPermitidas = req.empresas && req.empresas.length > 0 ? req.empresas : [];
    const tieneAcceso = empresasPermitidas.some(e => String(e) === empresaIdStr);
    if (!tieneAcceso) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }
    conversacion.estado = 'Abierto';
    await conversacion.save();
    return res.json({ ok: true, conversacion });
  } catch (error) {
    console.error('Error al reabrir conversación:', error);
    return res.status(500).json({ error: 'Error interno al reabrir conversación' });
  }
};

// ===== Agregar etiqueta a un contacto =====
const agregarEtiqueta = async (req, res) => {
  try {
    const { contactoId } = req.params;
    const { etiqueta } = req.body || {};

    if (!etiqueta || typeof etiqueta !== 'string' || etiqueta.trim() === '') {
      return res.status(400).json({ error: 'Etiqueta inválida' });
    }

    const contacto = await Cliente.findById(contactoId);
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    const nueva = etiqueta.trim();
    const actualizadas = Array.isArray(contacto.etiquetas) ? contacto.etiquetas : [];
    if (!actualizadas.includes(nueva)) {
      actualizadas.push(nueva);
      await Cliente.findByIdAndUpdate(contactoId, { $set: { etiquetas: actualizadas } }, { new: true });
    }

    return res.json({ ok: true, etiquetas: actualizadas });
  } catch (error) {
    console.error('Error al agregar etiqueta:', error);
    return res.status(500).json({ error: 'Error interno al agregar etiqueta' });
  }
};

// ===== Eliminar etiqueta de un contacto =====
const eliminarEtiqueta = async (req, res) => {
  try {
    const { contactoId, etiqueta } = req.params;

    if (!etiqueta) {
      return res.status(400).json({ error: 'Etiqueta requerida' });
    }

    const contacto = await Cliente.findById(contactoId);
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    const actuales = Array.isArray(contacto.etiquetas) ? contacto.etiquetas : [];
    const filtradas = actuales.filter(e => e !== etiqueta);
    await Cliente.findByIdAndUpdate(contactoId, { $set: { etiquetas: filtradas } }, { new: true });

    return res.json({ ok: true, etiquetas: filtradas });
  } catch (error) {
    console.error('Error al eliminar etiqueta:', error);
    return res.status(500).json({ error: 'Error interno al eliminar etiqueta' });
  }
};

// ===== Eliminar nota interna de un contacto =====
const eliminarNota = async (req, res) => {
  try {
    const { contactoId, nota } = req.params;

    if (!nota) {
      return res.status(400).json({ error: 'Nota requerida' });
    }

    const contacto = await Cliente.findById(contactoId);
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    const actuales = Array.isArray(contacto.notas) ? contacto.notas : [];
    const filtradas = actuales.filter(n => n !== nota);
    await Cliente.findByIdAndUpdate(
      contactoId,
      { $set: { notas: filtradas } },
      { new: true }
    );

    return res.json({ ok: true, notas: filtradas });
  } catch (error) {
    console.error('Error al eliminar nota:', error);
    return res.status(500).json({ error: 'Error interno al eliminar nota' });
  }
};

// ===== Agregar nota interna a un contacto =====
const agregarNota = async (req, res) => {
  try {
    const { contactoId } = req.params;
    const { nota } = req.body || {};

    if (!nota || typeof nota !== 'string' || nota.trim() === '') {
      return res.status(400).json({ error: 'Nota inválida' });
    }

    const contacto = await Cliente.findById(contactoId);
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    const actuales = Array.isArray(contacto.notas) ? contacto.notas : [];
    actuales.push(nota.trim());
    const actualizado = await Cliente.findByIdAndUpdate(
      contactoId,
      { $set: { notas: actuales } },
      { new: true }
    );

    return res.json({ ok: true, notas: actualizado.notas });
  } catch (error) {
    console.error('Error al agregar nota:', error);
    return res.status(500).json({ error: 'Error interno al agregar nota' });
  }
};

const bloquearCliente = async (req, res) => {
  try {
    const { contactoId } = req.params;
    const contacto = await Cliente.findByIdAndUpdate(
      contactoId,
      { $set: { bloqueado: true } },
      { new: true }
    );
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    return res.json({ ok: true, bloqueado: true, contacto });
  } catch (error) {
    console.error('Error al bloquear cliente:', error);
    return res.status(500).json({ error: 'Error interno al bloquear cliente' });
  }
};

const desbloquearCliente = async (req, res) => {
  try {
    const { contactoId } = req.params;
    const contacto = await Cliente.findByIdAndUpdate(
      contactoId,
      { $set: { bloqueado: false } },
      { new: true }
    );
    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    return res.json({ ok: true, bloqueado: false, contacto });
  } catch (error) {
    console.error('Error al desbloquear cliente:', error);
    return res.status(500).json({ error: 'Error interno al desbloquear cliente' });
  }
};

module.exports = {
  verificarWebhook,
  recibirMensaje,
  enviarMensaje,
  actualizarBotActivo,
  actualizarContacto,
  obtenerPedidoActivo,
  marcarAtendido,
  reabrirConversacion,
  agregarEtiqueta,
  eliminarEtiqueta,
  agregarNota,
  eliminarNota,
  bloquearCliente,
  desbloquearCliente
};
