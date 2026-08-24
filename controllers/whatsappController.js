const { generarTexto } = require('../services/iaService');
const { generarTextoConImagen, generarTextoConAudio } = require('../services/geminiService');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Empresa = require('../models/Empresa');
const Cliente = require('../models/Cliente');
const Conversacion = require('../models/Conversacion');
const Mensaje = require('../models/Mensaje');
const Producto = require('../models/Producto');
const Usuario = require('../models/usuario');
const Pedido = require('../models/Pedido');
const { guardarPedidoConfirmado } = require('./pedidosController');
const fs = require('fs');

// Prompt por defecto (mismo que estaba hardcodeado, pero con placeholders)
const PROMPT_IA_DEFAULT = `Sos el asistente virtual de {nombreLocal}. Respondé de forma breve y amable a los clientes.

Estado actual del local: {estadoLocal}.

Horarios de atención:
{horarios}

Atajos disponibles:
{atajos}

Reglas obligatorias:
- SIEMPRE pedí la dirección de entrega completa si todavía no la dio. No confirmes un pedido sin dirección.
- Preguntá cómo quiere pagar: efectivo o transferencia.
- No seas insistente con agregar productos. Si el cliente ya pidió o dijo que no quiere nada más, no vuelvas a ofrecerle más cosas.
- Si no encontrás la información en el catálogo, ofrecé contactar a un humano.
- Si el local está CERRADO, podés pasar el menú pero aclará de forma amable que no se están tomando pedidos hasta que abran. Igual podés registrar el pedido para cuando abran.

Catálogo actual:
{menuTexto}

Historial reciente:
{historialTexto}

Mensaje del cliente: "{mensajeCliente}"

Redactá una respuesta que sea útil para el cliente, indicando precios y opciones disponibles. Si el cliente está por confirmar un pedido y todavía no dio dirección, pedísela sí o sí antes de confirmar.`;

// Convierte los horarios estructurados en texto legible para la IA
function formatearHorarios(horarios) {
  if (!horarios || !Array.isArray(horarios) || horarios.length === 0) {
    return 'No configurados';
  }
  const ordenDias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const ordenados = [...horarios].sort((a, b) => {
    const da = ordenDias.indexOf(String(a.dia || '').toLowerCase());
    const db = ordenDias.indexOf(String(b.dia || '').toLowerCase());
    return (da === -1 ? 999 : da) - (db === -1 ? 999 : db);
  });
  return ordenados.map(h => `${h.dia}: ${h.apertura} a ${h.cierre}`).join(', ');
}

// Genera atajos automáticos basados en datos del Usuario (dueño del local)
function generarAtajosAutomaticos(usuario) {
  const atajos = [];
  if (!usuario) return atajos;

  // Dirección del local
  if (usuario.direccion && typeof usuario.direccion === 'string' && usuario.direccion.trim() !== '') {
    atajos.push({
      comando: '/direccion',
      respuesta: `Nuestro local está en ${usuario.direccion.trim()}`
    });
  }

  // Métodos de pago (efectivo, transferencia con alias/CVU, etc.)
  if (usuario.metodosPago && Array.isArray(usuario.metodosPago) && usuario.metodosPago.length > 0) {
    const transferencia = usuario.metodosPago.find(m => m.tipo === 'transferencia');
    const tieneEfectivo = usuario.metodosPago.some(m => m.tipo === 'efectivo');
    const tieneTarjeta = usuario.metodosPago.some(m => m.tipo === 'tarjeta');

    const lineas = [];

    const tipos = [];
    if (tieneEfectivo) tipos.push('efectivo');
    if (transferencia) tipos.push('transferencia');
    if (tieneTarjeta) tipos.push('tarjeta');
    if (tipos.length > 0) {
      lineas.push(`Aceptamos ${tipos.join(' y ')}.`);
    }

    if (transferencia?.alias) {
      lineas.push(`Alias/CVU: ${transferencia.alias}`);
    }

    if (transferencia?.titular) {
      lineas.push(`A nombre de ${transferencia.titular}`);
    }

    if (lineas.length > 0) {
      atajos.push({
        comando: '/pago',
        respuesta: lineas.join('\n')
      });
    }
  }

  return atajos;
}

// Combina atajos automáticos con los manuales guardados en la empresa
function combinarAtajos(usuario, empresa) {
  const atajosAuto = generarAtajosAutomaticos(usuario);
  const atajosManuales = (empresa && Array.isArray(empresa.atajos)) ? empresa.atajos : [];

  const comandosAuto = new Set(atajosAuto.map(a => a.comando));
  const manualesPorComando = {};
  atajosManuales.forEach(a => {
    if (a.comando) manualesPorComando[a.comando] = a;
  });

  // Los automáticos pueden ser pisados por manuales con el mismo comando
  const combinados = atajosAuto.map(a => manualesPorComando[a.comando] || a);

  // Agregar manuales que no pisan ningún automático
  atajosManuales.forEach(a => {
    if (!comandosAuto.has(a.comando)) {
      combinados.push(a);
    }
  });

  return combinados.filter(a => a.comando && a.respuesta);
}

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

async function incrementarContadorConversaciones(empresaId, conversacionId) {
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existeMensajeSaliente = await Mensaje.findOne({
    conversacionId,
    remitente: { $in: ['ia', 'empresa', 'humano', 'bot'] },
    createdAt: { $gte: hace24h }
  });
  if (!existeMensajeSaliente) {
    await Empresa.findByIdAndUpdate(empresaId, {
      $inc: { conversacionesUsadas24h: 1 }
    });
  }
}

const obtenerUsoConversaciones = async (req, res) => {
  try {
    const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
    if (!empresaId) {
      return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    }
    const empresa = await Empresa.findById(empresaId).lean();
    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    const usados = empresa.conversacionesUsadas24h || 0;
    const maximo = empresa.limiteConversaciones24h || 250;
    return res.json({ ok: true, usados, maximo });
  } catch (error) {
    console.error('Error al obtener uso conversaciones:', error);
    return res.status(500).json({ error: 'Error interno al obtener uso' });
  }
};

function verificarFirmaMeta(req, res, next) {
  const firma = req.headers['x-hub-signature-256'];
  if (!firma || !req.rawBody) {
    return res.sendStatus(401);
  }
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.error('⚠️ Falta WHATSAPP_APP_SECRET en variables de entorno');
    return res.sendStatus(401);
  }
  const hash = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  if (hash !== firma) {
    console.error('❌ Firma HMAC inválida');
    return res.sendStatus(401);
  }
  next();
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

    const esTexto = mensaje?.type === 'text';
    const telefonoCliente = mensaje?.from || '';
    const textoMensaje = esTexto ? (mensaje?.text?.body || '') : '';
    const contenidoEntrada = esTexto ? textoMensaje : '📎 Envío un mensaje multimedia';

    const whatsappMsgId = mensaje?.id || '';
    const t0 = performance.now();

    console.log(`🔍 [3] Datos extraídos -> Cliente: ${telefonoCliente} | Mi Local ID: ${whatsappPhoneId} | Texto: ${esTexto ? textoMensaje : '[MULTIMEDIA]'}`);

    if (!whatsappPhoneId || !telefonoCliente) {
      console.log("🛑 [4] Falla: Faltan datos clave (Teléfono, ID).");
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
    const localAbierto = empresa.abierto !== false;
    
    // Buscar el Usuario que posee la empresa para obtener sus platos
    const usuario = await Usuario.findById(empresa.usuarioAppId).lean();
    const productos = (usuario?.platos || []).filter(p => p.disponible !== false);

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
      contenido: contenidoEntrada,
      whatsappMsgId
    });

    await Conversacion.findByIdAndUpdate(conversacion._id, {
      $set: {
        ultimoMensaje: contenidoEntrada,
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
          contenido: contenidoEntrada,
          fecha: new Date()
        },
        conversacion: {
          _id: conversacion._id,
          ultimoMensaje: contenidoEntrada,
          updatedAt: new Date()
        }
      });
    }

    // ===== Manejo de mensajes multimedia (imagen, audio, video, etc.) =====
    if (!esTexto) {
      let respuestaAutomatica = "Disculpá, por el momento mi sistema automático solo puede leer mensajes de texto. Por favor, escribime tu consulta.";

      const phoneNumberId = metadata?.phone_number_id || whatsappPhoneId;
      const accessToken = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;

      // Si la empresa activó el procesamiento de imágenes, intentamos analizarla con Gemini
      if (mensaje.type === 'image' && empresa.procesarImagenes === true && accessToken) {
        const mediaId = mensaje.image?.id;
        if (mediaId) {
          try {
            // 1. Obtener la URL de descarga
            const mediaResp = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const mediaJson = await mediaResp.json();
            if (mediaJson.url) {
              // 2. Descargar el archivo binario
              const imgResp = await fetch(mediaJson.url, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
              const mimeType = mediaJson.mime_type || 'image/jpeg';
              const base64 = imgBuffer.toString('base64');

              // 3. Enviarlo a Gemini con visión
              const promptVision = "El cliente de un local de ropa te envió esta imagen. Analizá la imagen y respondé de forma breve y amable. Si es una prenda, preguntá por talle, color o cantidad. Si aparece texto, incluílo.";
              const respuestaIA = await generarTextoConImagen(promptVision, mimeType, base64);
              if (respuestaIA) {
                respuestaAutomatica = respuestaIA;
                console.log('✅ Imagen procesada con Gemini');
              }
            }
          } catch (error) {
            console.error('❌ Error al procesar imagen con Gemini:', error);
          }
        }
      }

      // Debug temporal para audios
      console.log('🎵 DEBUG AUDIO:', {
        type: mensaje.type,
        tieneAudioId: !!mensaje.audio?.id,
        tieneDocumentId: !!mensaje.document?.id,
        procesarAudios: empresa.procesarAudios,
        tieneToken: !!accessToken
      });

      // ===== Manejo de ubicaciones (maps) =====
      if (mensaje.type === 'location') {
        const lat = mensaje.location?.latitude;
        const lng = mensaje.location?.longitude;
        const nombreLugar = mensaje.location?.name || '';
        const addressWpp = mensaje.location?.address || '';

        let direccionFinal = addressWpp;

        // Si WhatsApp no mandó la dirección (solo lat/lng), intentamos con Nominatim
        if (!direccionFinal && lat && lng) {
          try {
            const urlNominatim = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
            const respNominatim = await fetch(urlNominatim, {
              headers: {
                'User-Agent': 'CRM-WhatsApp-Bot/1.0 (contacto: admin@example.com)'
              }
            });
            const dataNominatim = await respNominatim.json();
            if (dataNominatim && dataNominatim.display_name) {
              direccionFinal = dataNominatim.display_name;
            } else if (dataNominatim && dataNominatim.address) {
              // construimos una dirección simple
              const a = dataNominatim.address;
              const calle = a.road || a.pedestrian || '';
              const numero = a.house_number || '';
              direccionFinal = [calle, numero].filter(Boolean).join(' ');
              if (!direccionFinal) direccionFinal = dataNominatim.display_name;
            }
          } catch (error) {
            console.error('❌ Error al geocodificar con Nominatim:', error);
          }
        }

        // Guardar la dirección en el cliente si no tenía
        if (direccionFinal && (!contacto.direccion || contacto.direccion.trim() === '')) {
          await Cliente.findByIdAndUpdate(contacto._id, { $set: { direccion: direccionFinal } });
          contacto.direccion = direccionFinal;
          console.log('✅ Dirección guardada automáticamente desde la ubicación');
        }

        // Guardar lat/lng en la conversación para usarlas en el pedido posteriormente
        if (lat && lng) {
          await Conversacion.findByIdAndUpdate(conversacion._id, {
            $set: { latitud: lat, longitud: lng }
          });
          conversacion.latitud = lat;
          conversacion.longitud = lng;
          console.log('📍 Latitud/Longitud guardadas en la conversación');
        }

        // Construir respuesta
        if (lat && lng && process.env.GEMINI_API_KEY) {
          const promptUbicacion = `Sos el asistente virtual de ${empresa.nombre}. El cliente compartió su ubicación: ${nombreLugar} ${direccionFinal} (lat:${lat}, lng:${lng}). Respondé de forma breve y amable. Si el negocio hace envíos, indicá que anotaron la dirección y confirmá el pedido. Si no hacen envíos, disculpate y explicá cómo retirar por el local.`;
          const respuestaIA = await generarTexto(promptUbicacion);
          if (respuestaIA) {
            respuestaAutomatica = respuestaIA;
            console.log('✅ Ubicación procesada con Gemini');
          } else {
            respuestaAutomatica = `Gracias por compartir tu ubicación 📍`;
          }
        } else {
          respuestaAutomatica = `Gracias por compartir tu ubicación 📍`;
        }
      }

      // Si la empresa activó el procesamiento de audios, intentamos transcribirlo con Gemini
      const mediaIdMultimedia = mensaje.audio?.id || mensaje.document?.id;
      if (mediaIdMultimedia && empresa.procesarAudios === true && accessToken) {
        try {
          // 1. Obtener la URL de descarga
          const mediaResp = await fetch(`https://graph.facebook.com/v19.0/${mediaIdMultimedia}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const mediaJson = await mediaResp.json();
          const mimeTypeDetectado = mediaJson.mime_type || (mensaje.type === 'audio' ? 'audio/ogg' : 'application/octet-stream');
          const esArchivoAudio = mimeTypeDetectado.startsWith('audio/') || mensaje.type === 'audio';

          if (esArchivoAudio && mediaJson.url) {
            // 2. Descargar el archivo binario
            const audioResp = await fetch(mediaJson.url, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
            const mimeType = mimeTypeDetectado;
            const base64 = audioBuffer.toString('base64');

            // 3. Enviarlo a Gemini para procesar el audio y responder
            const promptAudio = `Sos el asistente virtual de ${empresa.nombre}. Un cliente te envió un mensaje de voz. Escuchá el audio y respondé DIRECTAMENTE al cliente, de forma breve y amable, continuando la conversación.

Reglas:
- NO incluyas la transcripción del audio en tu respuesta.
- NO uses títulos ni etiquetas como "Transcripción:", "Respuesta:", "Bot:", etc.
- Respondé SOLO con el mensaje final que se le enviará al cliente por WhatsApp.`;
            const respuestaIA = await generarTextoConAudio(promptAudio, mimeType, base64);
            if (respuestaIA) {
              respuestaAutomatica = respuestaIA;
              console.log('✅ Audio procesado con Gemini');
            }
          }
        } catch (error) {
          console.error('❌ Error al procesar audio con Gemini:', error);
        }
      }

      // Enviar respuesta al cliente por WhatsApp (si tenemos token)
      if (accessToken) {
        try {
          const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
          const payload = {
            messaging_product: 'whatsapp',
            to: telefonoCliente,
            type: 'text',
            text: { body: respuestaAutomatica }
          };
          await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          console.log('✅ Respuesta automática por multimedia enviada a WhatsApp');
        } catch (error) {
          console.error('❌ Error enviando respuesta automática de multimedia a WhatsApp:', error);
        }
      }

      // Guardar mensaje del bot en BD
      await Mensaje.create({
        conversacionId: conversacion._id,
        remitente: 'ia',
        contenido: respuestaAutomatica
      });

      await Conversacion.findByIdAndUpdate(conversacion._id, {
        $set: { ultimoMensaje: respuestaAutomatica }
      });

      const ioResp = req.app.get('io');
      if (ioResp) {
        ioResp.to(empresa._id.toString()).emit('mensaje-nuevo', {
          conversacionId: conversacion._id,
          mensaje: {
            remitente: 'ia',
            contenido: respuestaAutomatica,
            fecha: new Date()
          },
          conversacion: {
            _id: conversacion._id,
            ultimoMensaje: respuestaAutomatica,
            updatedAt: new Date()
          }
        });
      }

      // Finalizamos aquí, no procesamos carrito ni IA
      return;
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

        const estadoLocal = localAbierto
          ? 'ABIERTO'
          : 'CERRADO en este momento';

        const promptIA = (empresa.promptIA && empresa.promptIA.trim() !== '')
          ? empresa.promptIA.trim()
          : PROMPT_IA_DEFAULT;

        const horariosEmpresa = (empresa.horariosEstructurados && empresa.horariosEstructurados.length > 0)
          ? empresa.horariosEstructurados
          : (usuario?.horariosEstructurados || []);
        const horariosTexto = formatearHorarios(horariosEmpresa);

        const atajosCombinados = combinarAtajos(usuario, empresa);
        const atajosTexto = atajosCombinados.map(a => `- ${a.comando} → ${a.respuesta}`).join('\n');

        const prompt = promptIA
          .replaceAll('{nombreLocal}', empresa.nombre)
          .replaceAll('{estadoLocal}', estadoLocal)
          .replaceAll('{menuTexto}', menuTexto)
          .replaceAll('{historialTexto}', historialTexto)
          .replaceAll('{mensajeCliente}', textoMensaje)
          .replaceAll('{horarios}', horariosTexto)
          .replaceAll('{atajos}', atajosTexto);

        respuestaIA = await generarTexto(prompt);
      } catch (err) {
        console.error("❌ Error al generar respuesta con Gemini:", err);
      }
    }

    if (respuestaIA) {
      // Incrementar contador de conversaciones si es primera en 24 h
      await incrementarContadorConversaciones(empresa._id, conversacion._id);

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
              fecha: new Date(),
              latitud: conversacion.latitud || null,
              longitud: conversacion.longitud || null
            });

            // Limpiar carrito y coordenadas después de confirmar
            await Conversacion.findByIdAndUpdate(conversacion._id, {
              $set: { carrito: [], carritoTotal: 0, latitud: null, longitud: null }
            });
            conversacion.carrito = [];
            conversacion.carritoTotal = 0;
            conversacion.latitud = null;
            conversacion.longitud = null;
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

    // Incrementar contador de conversaciones si es la primera en 24 h
    await incrementarContadorConversaciones(conversacion.empresaId, conversacion._id);

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

async function subirFotoWhatsApp(empresa, fotoPath, fileSize, fileType) {
  const token = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    throw new Error('No se encontró token de WhatsApp para la empresa');
  }

  // Paso A: Crear sesión de subida
  const urlSesion = `https://graph.facebook.com/v19.0/app/uploads?file_length=${fileSize}&file_type=${encodeURIComponent(fileType)}`;
  const respSesion = await fetch(urlSesion, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!respSesion.ok) {
    const body = await respSesion.text();
    throw new Error(`Error creando sesión de upload: ${respSesion.status} ${body}`);
  }
  const dataSesion = await respSesion.json();
  const sessionId = dataSesion.id;
  if (!sessionId) {
    throw new Error('No se obtuvo session id de la respuesta de upload');
  }

  // Paso B: Subir binario
  const fileBuffer = fs.readFileSync(fotoPath);
  const respBinario = await fetch(`https://graph.facebook.com/v19.0/${sessionId}`, {
    method: 'POST',
    headers: {
      'Authorization': `OAuth ${token}`,
      'Content-Type': 'application/octet-stream'
    },
    body: fileBuffer
  });
  if (!respBinario.ok) {
    const body = await respBinario.text();
    throw new Error(`Error subiendo binario a Meta: ${respBinario.status} ${body}`);
  }
  const dataBinario = await respBinario.json();
  const handle = dataBinario.h;
  if (!handle) {
    throw new Error('No se obtuvo profile_picture_handle de la respuesta de binario');
  }
  return handle;
}

async function actualizarPerfilWhatsApp(empresa, estado, profilePictureHandle) {
  const token = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = empresa.whatsappPhoneId;
  if (!token || !phoneId) {
    throw new Error('Faltan credenciales para actualizar WhatsApp');
  }

  const url = `https://graph.facebook.com/v19.0/${phoneId}/whatsapp_business_profile`;
  const payload = {
    messaging_product: 'whatsapp'
  };
  if (estado !== undefined && estado !== null && estado !== '') {
    payload.about = estado;
  }
  if (profilePictureHandle) {
    payload.profile_picture_handle = profilePictureHandle;
  }

  console.log('📤 [META] Actualizando perfil WhatsApp...');
  console.log('📤 [META] URL:', url);
  console.log('📤 [META] Payload:', JSON.stringify(payload, null, 2));

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const respText = await resp.text();
  console.log('📥 [META] Respuesta del POST:', resp.status, respText);

  if (!resp.ok) {
    throw new Error(`Error actualizando perfil de WhatsApp: ${resp.status} ${respText}`);
  }

  // Verificar con GET si el about se aplicó realmente
  try {
    const urlGet = `https://graph.facebook.com/v19.0/${phoneId}/whatsapp_business_profile?fields=about`;
    const respGet = await fetch(urlGet, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const getText = await respGet.text();
    console.log('📥 [META] Respuesta del GET de verificación:', respGet.status, getText);
  } catch (e) {
    console.warn('⚠️ [META] No se pudo verificar el perfil con GET:', e.message);
  }

  return JSON.parse(respText);
}

const actualizarConfig = async (req, res) => {
  try {
    const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
    if (!empresaId) {
      return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    }

    const updates = {};

    if (req.body.nombre && typeof req.body.nombre === 'string') {
      updates.nombre = req.body.nombre.trim();
    }
    if (req.body.estado && typeof req.body.estado === 'string') {
      updates.estado = req.body.estado.trim();
    }
    if (typeof req.body.bienvenida === 'string') {
      updates.bienvenida = req.body.bienvenida.trim();
    }

    if (Array.isArray(req.body.horariosEstructurados)) {
      const horarios = req.body.horariosEstructurados.map(h => ({
        dia: (h.dia || '').trim().toLowerCase(),
        apertura: (h.apertura || '').trim(),
        cierre: (h.cierre || '').trim()
      })).filter(h => h.dia && h.apertura && h.cierre);
      updates.horariosEstructurados = horarios;
    }

    // Prompt: puede aplicar solo a la línea actual o a todas las líneas del usuario
    if (typeof req.body.promptIA === 'string') {
      const promptIA = req.body.promptIA.trim();
      if (req.body.aplicarATodasPrompt === true) {
        await Empresa.updateMany(
          { usuarioAppId: req.usuario.id },
          { $set: { promptIA } }
        );
      } else {
        updates.promptIA = promptIA;
      }
    }

    // Atajos: puede venir como array (JSON) o como string JSON (FormData)
    let atajos = null;
    if (Array.isArray(req.body.atajos)) {
      atajos = req.body.atajos
        .map(a => ({
          comando: (a.comando || '').trim(),
          respuesta: (a.respuesta || '').trim()
        }))
        .filter(a => a.comando && a.respuesta);
    } else if (typeof req.body.atajos === 'string' && req.body.atajos.trim() !== '') {
      try {
        const parsed = JSON.parse(req.body.atajos);
        if (Array.isArray(parsed)) {
          atajos = parsed
            .map(a => ({
              comando: (a.comando || '').trim(),
              respuesta: (a.respuesta || '').trim()
            }))
            .filter(a => a.comando && a.respuesta);
        }
      } catch (e) {
        return res.status(400).json({ error: 'El formato de atajos es inválido' });
      }
    }

    if (req.body.aplicarATodasAtajos === true) {
      if (atajos) {
        await Empresa.updateMany(
          { usuarioAppId: req.usuario.id },
          { $set: { atajos } }
        );
      }
    } else if (atajos) {
      updates.atajos = atajos;
    }

    if (typeof req.body.procesarImagenes === 'boolean') {
      updates.procesarImagenes = req.body.procesarImagenes;
    }
    if (typeof req.body.procesarAudios === 'boolean') {
      updates.procesarAudios = req.body.procesarAudios;
    }

    if (req.body.fotoPosicion && typeof req.body.fotoPosicion === 'string') {
      updates.fotoPosicion = req.body.fotoPosicion.trim();
    }

    if (req.file) {
      updates.fotoPerfil = `/uploads/${req.file.filename}`;
    }

    const estadoNuevo = (typeof req.body.estado === 'string') ? req.body.estado.trim() : null;
    const empresa = await Empresa.findByIdAndUpdate(empresaId, { $set: updates }, { new: true });
    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    let warning = '';
    try {
      let profileHandle = null;
      if (req.file) {
        profileHandle = await subirFotoWhatsApp(empresa, req.file.path, req.file.size, req.file.mimetype);
      }
      await actualizarPerfilWhatsApp(empresa, estadoNuevo, profileHandle);
    } catch (error) {
      console.error('Error al sincronizar con WhatsApp:', error);
      warning = 'Guardado localmente, pero falló la actualización en WhatsApp';
    }
    return res.json({ ok: true, empresa, warning: warning || undefined });
  } catch (error) {
    console.error('Error al actualizar config:', error);
    return res.status(500).json({ error: 'Error interno al actualizar config' });
  }
};

const obtenerConfig = async (req, res) => {
  try {
    const empresaId = req.empresaId || (req.empresas && req.empresas[0]);
    if (!empresaId) {
      return res.status(400).json({ error: 'No se pudo identificar la empresa' });
    }

    const empresa = await Empresa.findById(empresaId).lean();
    if (!empresa) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    console.log('[obtenerConfig] empresaId:', empresaId);
    console.log('[obtenerConfig] horarios de EMPRESA:', empresa.horariosEstructurados);
    console.log('[obtenerConfig] usuarioAppId:', empresa.usuarioAppId);

    // Si la empresa no tiene horarios cargados, usamos los del Usuario como referencia visual
    let horarios = empresa.horariosEstructurados || [];
    let usuario = null;
    if (empresa.usuarioAppId) {
      usuario = await Usuario.findById(empresa.usuarioAppId).lean();
      console.log('[obtenerConfig] horarios de USUARIO:', usuario?.horariosEstructurados);
      if ((!horarios || horarios.length === 0) && usuario && Array.isArray(usuario.horariosEstructurados) && usuario.horariosEstructurados.length > 0) {
        horarios = usuario.horariosEstructurados;
      }
    }

    // Normalizar día a minúsculas para que el frontend y el cron funcionen consistente
    horarios = horarios.map(h => ({
      ...h,
      dia: (h.dia || '').toLowerCase()
    }));

    console.log('[obtenerConfig] horarios FINAL que se devuelven:', horarios);

    const atajos = combinarAtajos(usuario, empresa);

    return res.json({
      ok: true,
      config: {
        nombre: empresa.nombre || '',
        promptIA: empresa.promptIA && empresa.promptIA.trim() !== ''
          ? empresa.promptIA
          : PROMPT_IA_DEFAULT,
        atajos,
        estado: empresa.estado || '',
        bienvenida: empresa.bienvenida || '',
        fotoPerfil: empresa.fotoPerfil || '',
        fotoPosicion: empresa.fotoPosicion || '50% 50%',
        horariosEstructurados: horarios,
        abierto: empresa.abierto !== false,
        procesarImagenes: empresa.procesarImagenes === true,
        procesarAudios: empresa.procesarAudios === true
      }
    });
  } catch (error) {
    console.error('Error al obtener config:', error);
    return res.status(500).json({ error: 'Error interno al obtener config' });
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
  verificarFirmaMeta,
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
  desbloquearCliente,
  actualizarConfig,
  obtenerUsoConversaciones,
  obtenerConfig
};
