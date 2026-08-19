// ============================================================
// CRM Omnicanal WhatsApp - Frontend Vanilla JS
// ============================================================

const USAR_MOCK_DATA = false;

// ===== Mock Data =====
// Basado en la estructura de los modelos definidos en proyecto.md

const MOCK_EMPRESA = {
  _id: 'emp1',
  nombre: 'Heladería Palermo',
  whatsappPhoneId: '5491100000000',
  promptIA: ''
};

const MOCK_USUARIO = {
  _id: 'emp1',
  nombreSucursal: 'Heladería Palermo',
  telefonosWhatsApp: ['Palermo', 'Recoleta']
};

const MOCK_CONTACTOS = [
  {
    _id: 'c1',
    empresaId: 'emp1',
    telefono: '5491100000001',
    nombre: 'Martina',
    etiquetas: ['VIP', 'Quejoso']
  },
  {
    _id: 'c2',
    empresaId: 'emp1',
    telefono: '5491100000002',
    nombre: 'Roberto',
    etiquetas: ['VIP']
  },
  {
    _id: 'c3',
    empresaId: 'emp1',
    telefono: '5491100000003',
    nombre: 'Sofía',
    etiquetas: []
  }
];

const MOCK_CONVERSACIONES = [
  {
    _id: 'conv1',
    empresaId: 'emp1',
    contactoId: 'c1',
    lineaReceptora: 'Palermo',
    botActivo: true,
    estado: 'Abierto',
    ultimoMensaje: 'Hola! Quería saber si todavía tenés el gusto de tiramisú',
    ultimaFecha: new Date('2024-08-13T14:35:00')
  },
  {
    _id: 'conv2',
    empresaId: 'emp1',
    contactoId: 'c2',
    lineaReceptora: 'Palermo',
    botActivo: false,
    estado: 'Abierto',
    ultimoMensaje: '¿Me podés pasar tu número?',
    ultimaFecha: new Date('2024-08-13T12:10:00')
  },
  {
    _id: 'conv3',
    empresaId: 'emp1',
    contactoId: 'c3',
    lineaReceptora: 'Recoleta',
    botActivo: true,
    estado: 'Resuelto',
    ultimoMensaje: '¡Gracias, ya me respondieron!',
    ultimaFecha: new Date('2024-08-12T09:20:00')
  }
];

const MOCK_MENSAJES = [
  { conversacionId: 'conv1', remitente: 'cliente', contenido: 'Hola! Quería saber si todavía tenés el gusto de tiramisú', fecha: new Date('2024-08-13T14:35:00') },
  { conversacionId: 'conv1', remitente: 'bot', contenido: '¡Hola Martina! Claro, tenemos tiramisú artesanal. ¿Te interesaría una docena?', fecha: new Date('2024-08-13T14:36:00') },
  { conversacionId: 'conv1', remitente: 'cliente', contenido: 'Sí, ¡perfecto! ¿Puedo encargar 6?', fecha: new Date('2024-08-13T14:38:00') },
  { conversacionId: 'conv1', remitente: 'nota_interna', contenido: 'Cliente VIP, recordar ofrecer descuento de temporada', fecha: new Date('2024-08-13T14:40:00') },
  { conversacionId: 'conv2', remitente: 'cliente', contenido: 'Hola, quería información sobre la delivery', fecha: new Date('2024-08-13T12:10:00') },
  { conversacionId: 'conv2', remitente: 'humano', contenido: 'Buenas Roberto, sí. ¿A qué dirección lo necesitás?', fecha: new Date('2024-08-13T12:11:00') },
  { conversacionId: 'conv3', remitente: 'cliente', contenido: 'Ya me respondieron, gracias!', fecha: new Date('2024-08-12T09:20:00') },
  { conversacionId: 'conv3', remitente: 'bot', contenido: '¡De nada! Que tengas buen día 😊', fecha: new Date('2024-08-12T09:21:00') }
];

// ===== Estado global =====
let CONTACTOS = [...MOCK_CONTACTOS];
let CONVERSACIONES = [...MOCK_CONVERSACIONES];
let MENSAJES = [...MOCK_MENSAJES];

let pestanaActiva = 'pendientes';
let chatActivoId = null;
let socket = null;
let miEmpresaId = null;
let whatsappSeleccionado = null;

// ===== Helpers =====
function getContactoPorId(id) {
  return CONTACTOS.find(c => c._id === id);
}

function getConversacionPorId(id) {
  return CONVERSACIONES.find(c => c._id === id);
}

function getMensajesDeConversacion(convId) {
  return MENSAJES.filter(m => m.conversacionId === convId);
}

function formatearHora(fecha) {
  return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatearFechaTooltip(fecha) {
  return fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

// ===== Renderers =====
function colorFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 65%, 45%)`;
}

function renderListaChats() {
  const container = document.getElementById('lista-chats');
  let base;
  if (pestanaActiva === 'todos') {
    base = CONVERSACIONES.filter(c => c.estado === 'Abierto');
  } else if (pestanaActiva === 'pendientes') {
    base = CONVERSACIONES.filter(c => c.estado === 'Abierto' && !c.botActivo);
  } else if (pestanaActiva === 'resueltos') {
    base = CONVERSACIONES.filter(c => c.estado === 'Resuelto');
  } else {
    base = CONVERSACIONES.filter(c => c.estado === 'Abierto');
  }
  const filtrados = whatsappSeleccionado
    ? base.filter(c => c.lineaReceptora === whatsappSeleccionado)
    : base;

  container.innerHTML = filtrados.map(conv => {
    const contacto = getContactoPorId(conv.contactoId);
    const inicial = (contacto.nombre || '?').charAt(0).toUpperCase();
    const requiereAtencionClase = !conv.botActivo ? 'requiere-atencion' : '';
    const indicadorClase = conv.botActivo ? 'activo' : 'requiere-atencion-ind';
    const activaClase = conv._id === chatActivoId ? 'activo' : '';

    return `
      <div class="chat-item ${activaClase} ${requiereAtencionClase}" data-conv-id="${conv._id}">
        <div class="chat-item-avatar">${inicial}</div>
        <div class="chat-item-contenido">
          <div class="chat-item-titulo">
            <span class="chat-item-nombre">${contacto.nombre}</span>
            <span class="chat-item-hora">${formatearHora(conv.ultimaFecha)}</span>
          </div>
          <div class="chat-item-linea">${conv.lineaReceptora}</div>
          <div class="chat-item-ultimo">${conv.ultimoMensaje}</div>
        </div>
        <div class="chat-item-indicador ${indicadorClase}" title="${conv.botActivo ? 'Bot activo' : 'Requiere humano'}"></div>
      </div>
    `;
  }).join('');

  // Asociar clics en cada ítem
  document.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', () => {
      chatActivoId = item.dataset.convId;
      renderTodo();
    });
  });
}

function renderChatActivo() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;

  const contacto = getContactoPorId(conv.contactoId);
  const toggle = document.getElementById('toggle-bot');
  const estadoBot = document.getElementById('estado-bot');

  document.getElementById('chat-nombre').textContent = contacto.nombre;
  document.getElementById('chat-linea').textContent = conv.lineaReceptora;

  toggle.checked = conv.botActivo;
  estadoBot.textContent = conv.botActivo ? 'Bot Activo' : 'Pausado';

  // Mensajes
  const areaMensajes = document.getElementById('area-mensajes');
  const mensajes = getMensajesDeConversacion(conv._id);

  areaMensajes.innerHTML = mensajes.map(msg => {
    let claseBurbuja = '';
    if (msg.remitente === 'cliente') claseBurbuja = 'bubble-cliente';
    else if (['bot', 'humano', 'ia', 'empresa'].includes(msg.remitente)) claseBurbuja = 'bubble-humano';
    else if (msg.remitente === 'nota_interna') claseBurbuja = 'bubble-nota';

    return `<div class="bubble ${claseBurbuja}">${msg.contenido}</div>`;
  }).join('');

  // Habilitar campo de envío de mensajes para el chat activo
  const inputMensaje = document.getElementById('input-mensaje');
  const btnEnviar = document.getElementById('btn-enviar');
  if (inputMensaje && btnEnviar) {
    inputMensaje.disabled = false;
    btnEnviar.disabled = false;
  }

  // Etiquetas del perfil
  renderPerfil(contacto);

  // Mostrar carrito en vivo o último pedido confirmado
  renderPanelPedido(conv, contacto);
}

function renderPerfil(contacto) {
  const nombre = contacto.nombre || '';
  const telefono = contacto.telefono || '';

  document.getElementById('perfil-nombre').value = nombre;
  document.getElementById('perfil-telefono').value = telefono;
  const inputDireccion = document.getElementById('perfil-direccion-input');
  const inputPisoDepto = document.getElementById('perfil-pisodpto-input');
  const inputCodigoPostal = document.getElementById('perfil-codigopostal-input');
  if (inputDireccion) inputDireccion.value = contacto.direccion || '';
  if (inputPisoDepto) inputPisoDepto.value = contacto.pisoDepto || '';
  if (inputCodigoPostal) inputCodigoPostal.value = contacto.codigoPostal || '';
  const nombreTexto = document.getElementById('perfil-nombre-texto');
  if (nombreTexto) nombreTexto.textContent = nombre;
  const telefonoTexto = document.getElementById('perfil-telefono-texto');
  if (telefonoTexto) telefonoTexto.textContent = telefono;
  const avatar = document.getElementById('perfil-avatar');
  if (avatar) avatar.textContent = (nombre || '?').charAt(0).toUpperCase();

  const contEtiquetas = document.getElementById('lista-etiquetas');
  if (!contEtiquetas) return;
  const etiquetas = Array.isArray(contacto.etiquetas) ? contacto.etiquetas : [];
  if (etiquetas.length === 0) {
    contEtiquetas.innerHTML = '<span class="etiquetas-vacio">Sin etiquetas asignadas</span>';
    return;
  }

  contEtiquetas.innerHTML = etiquetas.map(etiqueta => {
    const color = colorFromString(etiqueta);
    return `<span class="etiqueta-pill" style="background:${color}22; border-color:${color}">
              ${etiqueta}
              <button class="etiqueta-remove" data-etiqueta="${etiqueta}" title="Eliminar etiqueta">×</button>
            </span>`;
  }).join('');

  const contNotas = document.getElementById('modal-lista-notas');
  if (contNotas) {
    const notas = Array.isArray(contacto.notas) ? contacto.notas : [];
    if (notas.length === 0) {
      contNotas.innerHTML = '<span class="notas-vacio">Sin notas internas</span>';
    } else {
      contNotas.innerHTML = notas.map(n => `<div class="nota-item">${n}</div>`).join('');
    }
  }
}

function renderTodo() {
  renderListaChats();
  renderChatActivo();
  updateVisibilidad();
}

// ===== Alternancia de vistas (Sidebar) =====
function showView(vista) {
  const inboxView = document.getElementById('inbox-view');
  const configView = document.getElementById('config-view');
  const btnInbox = document.getElementById('btn-inbox');
  const btnConfig = document.getElementById('btn-config');

  if (vista === 'inbox') {
    inboxView.classList.remove('hidden');
    configView.classList.add('hidden');
    btnInbox.classList.add('activo');
    btnConfig.classList.remove('activo');
  } else {
    inboxView.classList.add('hidden');
    configView.classList.remove('hidden');
    btnInbox.classList.remove('activo');
    btnConfig.classList.add('activo');
  }
}

function initConfigSidebar() {
  // Mostrar/ocultar paneles de configuración
  const configItems = document.querySelectorAll('.config-item[data-panel]');
  configItems.forEach(item => {
    item.addEventListener('click', () => {
      // quitar activo de todos
      document.querySelectorAll('.config-item[data-panel]').forEach(i => i.classList.remove('activo'));
      item.classList.add('activo');

      // ocultar todos los paneles
      document.querySelectorAll('.config-panel').forEach(p => p.classList.add('hidden'));

      // mostrar el panel correspondiente
      const panelId = item.dataset.panel;
      const panel = document.getElementById(panelId);
      if (panel) {
        panel.classList.remove('hidden');
      }
    });
  });

  // Sliders de tono de comunicación
  const sliders = document.querySelectorAll('input[type="range"]');
  sliders.forEach(slider => {
    slider.addEventListener('input', (e) => {
      const valorSpan = document.getElementById(slider.id + '-valor');
      if (valorSpan) {
        valorSpan.textContent = e.target.value;
      }
    });
  });
}

function updateVisibilidad() {
  const app = document.getElementById('app');
  if (chatActivoId) {
    app.classList.remove('sin-chat');
  } else {
    app.classList.add('sin-chat');
  }

  const inputMensaje = document.getElementById('input-mensaje');
  const btnEnviar = document.getElementById('btn-enviar');
  if (inputMensaje && btnEnviar) {
    inputMensaje.disabled = !chatActivoId;
    btnEnviar.disabled = !chatActivoId;
  }
}

// ===== Carga de conversaciones desde API =====
async function cargarConversaciones() {
  if (USAR_MOCK_DATA) {
    // Modo mock: usamos los arrays definidos arriba
    CONVERSACIONES = [...MOCK_CONVERSACIONES];
    CONTACTOS = [...MOCK_CONTACTOS];
    MENSAJES = [...MOCK_MENSAJES];
    if (!chatActivoId && CONVERSACIONES.length > 0) {
      chatActivoId = CONVERSACIONES[0]._id;
    }
    renderTodo();
    return;
  }

  try {
    const token = localStorage.getItem('token') || '';
    const res = await fetch('/api/conversaciones', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error(`Error HTTP: ${res.status}`);
    }

    const data = await res.json();
    const convsApi = data.conversaciones || [];

    const contactosMap = new Map();
    const mensajesAll = [];

    const conversacionesLocal = convsApi.map(conv => {
      const contacto = conv.contactoId || {};
      const cId = contacto._id || conv.contactoId;
      const nombre = contacto.nombre || '';
      const telefono = contacto.telefono || '';

      if (!contactosMap.has(cId)) {
        contactosMap.set(cId, {
          _id: cId,
          empresaId: conv.empresaId,
          telefono,
          nombre,
          direccion: contacto.direccion || '',
          pisoDepto: contacto.pisoDepto || '',
          codigoPostal: contacto.codigoPostal || '',
          etiquetas: Array.isArray(contacto.etiquetas) ? contacto.etiquetas : [],
          notas: Array.isArray(contacto.notas) ? contacto.notas : []
        });
      }

      if (conv.mensajes) {
        conv.mensajes.forEach(m => {
          mensajesAll.push({
            conversacionId: conv._id,
            remitente: m.remitente,
            contenido: m.contenido,
            fecha: m.fecha ? new Date(m.fecha) : new Date()
          });
        });
      }

      return {
        _id: conv._id,
        empresaId: conv.empresaId,
        contactoId: cId,
        lineaReceptora: conv.lineaReceptora || '',
        botActivo: conv.botActivo ?? true,
        estado: conv.estado || 'Abierto',
        ultimoMensaje: conv.ultimoMensaje || '',
        ultimaFecha: conv.updatedAt ? new Date(conv.updatedAt) : new Date(),
        carrito: conv.carrito || [],
        carritoTotal: conv.carritoTotal || 0
      };
    });

    CONTACTOS = Array.from(contactosMap.values());
    CONVERSACIONES = conversacionesLocal;
    MENSAJES = mensajesAll;

    // Obtener líneas de WhatsApp desde las conversaciones (ya no usamos /api/usuario)
    const lineas = Array.from(new Set(conversacionesLocal.map(c => c.lineaReceptora).filter(Boolean)));
    if (lineas.length > 0) {
      poblarSelectorWhatsApp(lineas);
      if (!whatsappSeleccionado || !lineas.includes(whatsappSeleccionado)) {
        whatsappSeleccionado = lineas[0];
      }
    }

    if (!chatActivoId && CONVERSACIONES.length > 0) {
      chatActivoId = CONVERSACIONES[0]._id;
    }

    // Conectar a Socket.io si aún no estamos conectados
    if (typeof io !== 'undefined' && !socket) {
      socket = io();
      setupSocketListeners();
    }

    const primeraEmpresa = convsApi[0] && (convsApi[0].empresaId || convsApi[0].parrillaId);
    if (socket && primeraEmpresa && primeraEmpresa !== miEmpresaId) {
      miEmpresaId = primeraEmpresa;
      socket.emit('join', miEmpresaId);
    }

    renderTodo();
  } catch (error) {
    console.error('Error al cargar conversaciones:', error);
    // Fallback a mock data para que la pantalla no quede vacía
    CONVERSACIONES = [...MOCK_CONVERSACIONES];
    CONTACTOS = [...MOCK_CONTACTOS];
    MENSAJES = [...MOCK_MENSAJES];
    poblarSelectorWhatsApp(MOCK_USUARIO.telefonosWhatsApp);
    if (MOCK_USUARIO.telefonosWhatsApp.length > 0) {
      whatsappSeleccionado = MOCK_USUARIO.telefonosWhatsApp[0];
    }
    renderTodo();
  }
}

// ===== Datos del usuario (nombreSucursal y líneas WhatsApp) =====
async function cargarDatosUsuario() {
  if (USAR_MOCK_DATA) {
    const usuario = MOCK_USUARIO;
    poblarSelectorWhatsApp(usuario.telefonosWhatsApp);
    if (usuario.telefonosWhatsApp.length > 0) {
      whatsappSeleccionado = usuario.telefonosWhatsApp[0];
    } else {
      whatsappSeleccionado = null;
    }
    return;
  }

  // El manejo de usuarios queda en otro proyecto.
  // Las líneas de WhatsApp se obtienen de las conversaciones (cargarConversaciones).
}

function poblarSelectorWhatsApp(telefonos) {
  const select = document.getElementById('select-whatsapp');
  if (!select) return;
  select.innerHTML = '';
  telefonos.forEach(num => {
    const opt = document.createElement('option');
    opt.value = num;
    opt.textContent = num;
    select.appendChild(opt);
  });
  if (telefonos.length > 0) {
    select.value = telefonos[0];
  }
}

function setupSocketListeners() {
  if (!socket) return;
  socket.on('mensaje-nuevo', (payload) => {
    const { conversacionId, mensaje, conversacion } = payload;

    // Agregar mensaje a la colección local
    MENSAJES.push({
      conversacionId: conversacionId,
      remitente: mensaje.remitente,
      contenido: mensaje.contenido,
      fecha: new Date(mensaje.fecha)
    });

    // Actualizar la conversación local
    const convLocal = CONVERSACIONES.find(c => c._id === conversacionId);
    if (convLocal) {
      convLocal.ultimoMensaje = (conversacion && conversacion.ultimoMensaje) || mensaje.contenido;
      convLocal.ultimaFecha = (conversacion && conversacion.updatedAt)
        ? new Date(conversacion.updatedAt)
        : new Date();

      if (chatActivoId === conversacionId) {
        renderChatActivo();
        const area = document.getElementById('area-mensajes');
        if (area) area.scrollTop = area.scrollHeight;
      }
      renderListaChats();
    } else {
      // Puede ser una conversación nueva, recargamos para obtenerla completa
      cargarConversaciones();
    }
  });

  socket.on('carrito-actualizado', (payload) => {
    if (!payload || !payload.conversacionId) return;
    const conv = CONVERSACIONES.find(c => c._id === payload.conversacionId);
    if (conv) {
      conv.carrito = payload.carrito || [];
      conv.carritoTotal = payload.total || 0;
      if (chatActivoId === payload.conversacionId) {
        renderPanelPedido(conv, getContactoPorId(conv.contactoId));
      }
    }
  });

  socket.on('pedido-actualizado', (payload) => {
    if (!payload || !payload.conversacionId) return;
    if (payload.conversacionId === chatActivoId) {
      cargarPedidoActivo(payload.conversacionId);
    }
  });
}

// ===== Envío manual de mensaje desde el dashboard =====
async function enviarMensajeDesdePanel() {
  const input = document.getElementById('input-mensaje');
  if (!input) return;
  const mensaje = input.value.trim();
  if (!mensaje || !chatActivoId) return;

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/whatsapp/enviar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ conversacionId: chatActivoId, mensaje })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Error al enviar mensaje:', data.error || data);
      return;
    }
    input.value = '';
  } catch (error) {
    console.error('Error de red al enviar mensaje:', error);
  }
}

async function guardarDetallesCliente() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) {
    console.error('Contacto no encontrado');
    return;
  }

  const direccion = (document.getElementById('perfil-direccion-input') || {}).value?.trim() || '';
  const pisoDepto = (document.getElementById('perfil-pisodpto-input') || {}).value?.trim() || '';
  const codigoPostal = (document.getElementById('perfil-codigopostal-input') || {}).value?.trim() || '';

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ direccion, pisoDepto, codigoPostal })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al guardar detalles:', data.error || res.status);
      return;
    }

    contacto.direccion = direccion;
    contacto.pisoDepto = pisoDepto;
    contacto.codigoPostal = codigoPostal;
  } catch (error) {
    console.error('Error de red al guardar detalles:', error);
  }
}

// ===== Funciones para modal de detalles =====
function abrirDetallesModal() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  document.getElementById('modal-nombre').value = contacto.nombre || '';
  document.getElementById('modal-telefono').value = contacto.telefono || '';
  document.getElementById('modal-direccion').value = contacto.direccion || '';
  document.getElementById('modal-pisodpto').value = contacto.pisoDepto || '';
  document.getElementById('modal-codigopostal').value = contacto.codigoPostal || '';

  const menu = document.getElementById('perfil-menu');
  if (menu) menu.classList.add('hidden');
  const modal = document.getElementById('modal-detalles');
  if (modal) modal.classList.remove('hidden');
}

function cerrarDetallesModal() {
  const modal = document.getElementById('modal-detalles');
  if (modal) modal.classList.add('hidden');
}

async function guardarDetallesDesdeModal() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  const direccion = (document.getElementById('modal-direccion') || {}).value?.trim() || '';
  const pisoDepto = (document.getElementById('modal-pisodpto') || {}).value?.trim() || '';
  const codigoPostal = (document.getElementById('modal-codigopostal') || {}).value?.trim() || '';

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ direccion, pisoDepto, codigoPostal })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al guardar detalles:', data.error || res.status);
      return;
    }

    contacto.direccion = direccion;
    contacto.pisoDepto = pisoDepto;
    contacto.codigoPostal = codigoPostal;

    // Sincronizar con los campos del panel principal
    const inputDir = document.getElementById('perfil-direccion-input');
    const inputPiso = document.getElementById('perfil-pisodpto-input');
    const inputCP = document.getElementById('perfil-codigopostal-input');
    if (inputDir) inputDir.value = direccion;
    if (inputPiso) inputPiso.value = pisoDepto;
    if (inputCP) inputCP.value = codigoPostal;

    cerrarDetallesModal();
  } catch (error) {
    console.error('Error de red al guardar detalles:', error);
  }
}

// ===== Cargar pedido activo =====
async function cargarPedidoActivo(conversacionId, telefono) {
  const token = localStorage.getItem('token') || '';
  const contenedor = document.getElementById('pedido-info');
  if (!contenedor) return;
  contenedor.innerHTML = '<span style="color:#9CA3AF;">Cargando...</span>';

  // 1. Intentar obtener pedidos desde el endpoint específico por número de teléfono
  if (telefono) {
    try {
      const res = await fetch(`/api/pedidos/cliente/${encodeURIComponent(telefono)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const pedidos = data.pedidos || [];
        const pedidoConfirmado = pedidos.find(p => p.estado === 'confirmado') ||
                                 pedidos[0];
        if (pedidoConfirmado) {
          contenedor.innerHTML = renderPedido(contenedor, pedidoConfirmado);
          return;
        }
      }
    } catch (e) {
      console.warn('No se pudo obtener pedidos por teléfono, usando fallback:', e);
    }
  }

  // 2. Fallback al endpoint antiguo por conversación
  try {
    const res = await fetch(`/api/whatsapp/conversacion/${conversacionId}/pedido-activo`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
    const pedido = data.pedido;
    if (!pedido || pedido.estado === 'Entregado' || pedido.estado === 'Cancelado') {
      contenedor.innerHTML = '<span style="color:#9CA3AF;">Sin pedidos en curso</span>';
      return;
    }
    contenedor.innerHTML = renderPedido(contenedor, pedido);
  } catch (error) {
    console.error('Error al obtener pedido:', error);
    contenedor.innerHTML = '<span style="color:#9CA3AF;">No se pudo cargar el pedido</span>';
  }
}

function renderCarrito(items, total) {
  let html = '';
  if (!items || items.length === 0) {
    return '<span style="color:#9CA3AF;">Sin ítems aún</span>';
  }
  items.forEach(item => {
    const cantidad = item.cantidad || 1;
    const precio = item.precioUnitario || 0;
    const subtotal = (cantidad * precio).toFixed(2);
    html += `<div class="pedido-item">
      <span class="pedido-item-nombre">${item.nombre}</span>
      <span class="pedido-item-cantidad">× ${cantidad}</span>
      <span class="pedido-item-precio">$${precio.toFixed(2)}</span>
      <span class="pedido-item-subtotal">$${subtotal}</span>
    </div>`;
  });
  html += `<div class="pedido-total">Total parcial: $${(Number(total) || 0).toFixed(2)}</div>`;
  return html;
}

function renderPanelPedido(conv, contacto) {
  const contenedor = document.getElementById('pedido-info');
  if (!contenedor) return;

  if (conv.carrito && conv.carrito.length > 0) {
    contenedor.innerHTML = renderCarrito(conv.carrito, conv.carritoTotal);
    return;
  }

  // No hay carrito en construcción → buscamos último pedido confirmado
  cargarPedidoActivo(conv._id, contacto.telefono);
}

function renderPedido(contenedor, pedido) {
  let html = '';
  if (pedido.items && pedido.items.length) {
    pedido.items.forEach(item => {
      const cantidad = item.cantidad || 0;
      const precio = item.precioUnitario || 0;
      const subtotal = (cantidad * precio).toFixed(2);
      html += `<div class="pedido-item">
        <span class="pedido-item-nombre">${item.nombre}</span>
        <span class="pedido-item-cantidad">× ${cantidad}</span>
        <span class="pedido-item-precio">$${precio.toFixed(2)}</span>
        <span class="pedido-item-subtotal">$${subtotal}</span>
      </div>`;
    });
  } else {
    html = '<div style="color:#9CA3AF;">Pedido sin ítems</div>';
  }
  const total = (pedido.total || 0).toFixed(2);
  const direccion = pedido.direccion || pedido.direccionEntrega || 'No especificada';
  const estado = pedido.estado || 'Pendiente';
  html += `<div class="pedido-total">Total: $${total}</div>`;
  html += `<div class="pedido-direccion">Entrega: ${direccion}</div>`;
  html += `<div class="pedido-estado"><span class="badge-estado">${estado}</span></div>`;
  return html;
}

// ===== Funciones de etiquetas =====
async function agregarEtiquetaDesdeUI() {
  const input = document.getElementById('nueva-etiqueta-input');
  if (!input) return;
  const etiqueta = input.value.trim();
  if (!etiqueta || !chatActivoId) return;

  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}/etiquetas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ etiqueta })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al agregar etiqueta:', data.error || res.status);
      return;
    }

    const data = await res.json();
    contacto.etiquetas = data.etiquetas || [...(contacto.etiquetas || []), etiqueta];
    input.value = '';
    if (chatActivoId) renderChatActivo();
  } catch (error) {
    console.error('Error de red al agregar etiqueta:', error);
  }
}

async function eliminarEtiquetaDesdeUI(etiqueta) {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}/etiquetas/${encodeURIComponent(etiqueta)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al eliminar etiqueta:', data.error || res.status);
      return;
    }

    const data = await res.json();
    contacto.etiquetas = data.etiquetas || [];
    if (chatActivoId) renderChatActivo();
  } catch (error) {
    console.error('Error de red al eliminar etiqueta:', error);
  }
}

// ===== Guardar nota interna =====
async function guardarNota() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;
  const textarea = document.getElementById('nota-interna-textarea');
  const nota = textarea?.value?.trim();
  if (!nota) return;
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}/notas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ nota })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al guardar nota:', data.error || res.status);
      return;
    }
    const data = await res.json();
    contacto.notas = data.notas || [...(contacto.notas || []), nota];
    if (textarea) textarea.value = '';
    if (chatActivoId) renderChatActivo();
  } catch (error) {
    console.error('Error de red al guardar nota:', error);
  }
}

// ===== Login con PIN =====
function mostrarModalLogin() {
  document.body.classList.add('modo-login');
  const modal = document.getElementById('modal-login');
  if (modal) modal.classList.remove('hidden');
  const inputTelefono = document.getElementById('input-telefono');
  if (inputTelefono) {
    inputTelefono.value = '';
  }
  const inputPin = document.getElementById('input-pin');
  if (inputPin) {
    inputPin.value = '';
  }
  const primerCampo = document.getElementById('input-telefono') || document.getElementById('input-pin');
  if (primerCampo) primerCampo.focus();
  const errorEl = document.getElementById('login-error');
  if (errorEl) errorEl.classList.add('hidden');
}

function ocultarModalLogin() {
  document.body.classList.remove('modo-login');
  const modal = document.getElementById('modal-login');
  if (modal) modal.classList.add('hidden');
}

async function manejarLogin() {
  const inputTelefono = document.getElementById('input-telefono');
  const telefono = inputTelefono?.value?.trim() || '';
  const inputPin = document.getElementById('input-pin');
  const pin = inputPin?.value?.trim() || '';
  const errorEl = document.getElementById('login-error');

  if (!telefono) {
    if (errorEl) {
      errorEl.textContent = 'Ingresá tu número de WhatsApp';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  if (!pin) {
    if (errorEl) {
      errorEl.textContent = 'Ingresá tu PIN';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  if (errorEl) errorEl.classList.add('hidden');

  try {
    const res = await fetch('/api/whatsapp/login-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono, pin })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Credenciales inválidas');
    }

    localStorage.setItem('token', data.token);
    ocultarModalLogin();

    // Arrancamos el CRM recién después de autenticar
    await cargarDatosUsuario();
    await cargarConversaciones();
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    if (errorEl) {
      errorEl.textContent = 'Número de WhatsApp o PIN inválidos. Intentá de nuevo.';
      errorEl.classList.remove('hidden');
    }
  }
}

// ===== Eventos =====
function init() {
  // Pestañas
  document.querySelectorAll('.pestana').forEach(btn => {
    btn.addEventListener('click', () => {
      pestanaActiva = btn.dataset.pestana;
      document.querySelectorAll('.pestana').forEach(b => b.classList.remove('activa'));
      btn.classList.add('activa');
      renderListaChats();
    });
  });

  // Toggle del bot (actualiza botActivo en la empresa)
  document.getElementById('toggle-bot').addEventListener('change', async (e) => {
    const nuevoValor = e.target.checked;
    document.getElementById('estado-bot').textContent = nuevoValor ? 'Bot Activo' : 'Pausado';

    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch('/api/whatsapp/bot-activo', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ botActivo: nuevoValor })
      });

      if (!res.ok) {
        // revertir estado si falla
        e.target.checked = !nuevoValor;
        document.getElementById('estado-bot').textContent = !nuevoValor ? 'Bot Activo' : 'Pausado';
        console.error('Error al actualizar botActivo');
      } else {
        // Actualizar conversaciones locales para reflejar el nuevo estado
        CONVERSACIONES.forEach(c => {
          c.botActivo = nuevoValor;
        });
        renderListaChats();
        if (chatActivoId) {
          renderChatActivo();
        }
      }
    } catch (error) {
      e.target.checked = !nuevoValor;
      document.getElementById('estado-bot').textContent = !nuevoValor ? 'Bot Activo' : 'Pausado';
      console.error('Error de red al actualizar botActivo:', error);
    }
  });

  // Sidebar: alternar entre Inbox y Configuración
  document.getElementById('btn-inbox').addEventListener('click', () => showView('inbox'));
  document.getElementById('btn-config').addEventListener('click', () => showView('config'));

  // Configuración del Bot
  initConfigSidebar();

  // Selector de cuenta WhatsApp
  const selectWhatsapp = document.getElementById('select-whatsapp');
  if (selectWhatsapp) {
    selectWhatsapp.addEventListener('change', (e) => {
      whatsappSeleccionado = e.target.value;
      const convActual = chatActivoId ? getConversacionPorId(chatActivoId) : null;
      if (convActual && convActual.lineaReceptora !== whatsappSeleccionado) {
        chatActivoId = null;
      }
      renderTodo();
    });
  }

  // Botón para crear nuevo agente (placeholder)
  const btnNuevoAgente = document.getElementById('btn-nuevo-agente');
  if (btnNuevoAgente) {
    btnNuevoAgente.addEventListener('click', () => {
      console.log('Función para crear nuevo agente próximamente');
    });
  }

  // Eventos del modal de login
  const btnIngresar = document.getElementById('btn-ingresar');
  if (btnIngresar) btnIngresar.addEventListener('click', manejarLogin);

  const inputTelefono = document.getElementById('input-telefono');
  if (inputTelefono) {
    inputTelefono.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        manejarLogin();
      }
    });
  }

  const inputPin = document.getElementById('input-pin');
  if (inputPin) {
    inputPin.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        manejarLogin();
      }
    });
  }

  // Verificamos si ya hay un token guardado
  const tokenGuardado = localStorage.getItem('token');
  if (!tokenGuardado) {
    mostrarModalLogin();
  } else {
    // Cargar datos del usuario (nombreSucursal y telefonosWhatsApp)
    cargarDatosUsuario();

    // Cargar conversaciones (fetch o mock)
    cargarConversaciones();
  }

  // Envío manual de mensaje
  const btnEnviar = document.getElementById('btn-enviar');
  const inputMensaje = document.getElementById('input-mensaje');
  if (btnEnviar) {
    btnEnviar.addEventListener('click', enviarMensajeDesdePanel);
  }
  if (inputMensaje) {
    inputMensaje.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        enviarMensajeDesdePanel();
      }
    });
  }

  // Guardar detalles del cliente
  const btnGuardarDetalles = document.getElementById('btn-guardar-detalles');
  if (btnGuardarDetalles) {
    btnGuardarDetalles.addEventListener('click', guardarDetallesCliente);
  }

  // Menú de tres puntos en perfil-header
  const btnMas = document.getElementById('btn-mas');
  const perfilMenu = document.getElementById('perfil-menu');
  if (btnMas && perfilMenu) {
    btnMas.addEventListener('click', (e) => {
      e.stopPropagation();
      perfilMenu.classList.toggle('hidden');
    });
  }
  document.addEventListener('click', (e) => {
    if (perfilMenu && !e.target.closest('.perfil-acciones')) {
      perfilMenu.classList.add('hidden');
    }
  });

  // Abrir y cerrar modal de detalles
  const btnDetalles = document.getElementById('btn-detalles-modal');
  if (btnDetalles) btnDetalles.addEventListener('click', abrirDetallesModal);
  const btnCerrar = document.getElementById('btn-cerrar-detalles');
  if (btnCerrar) btnCerrar.addEventListener('click', cerrarDetallesModal);
  const btnGuardarModal = document.getElementById('modal-guardar-detalles');
  if (btnGuardarModal) btnGuardarModal.addEventListener('click', guardarDetallesDesdeModal);

  // Botón y input para agregar etiquetas
  const btnAgregarEtiqueta = document.getElementById('btn-agregar-etiqueta');
  const inputNuevaEtiqueta = document.getElementById('nueva-etiqueta-input');
  if (btnAgregarEtiqueta) {
    btnAgregarEtiqueta.addEventListener('click', agregarEtiquetaDesdeUI);
  }
  if (inputNuevaEtiqueta) {
    inputNuevaEtiqueta.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        agregarEtiquetaDesdeUI();
      }
    });
  }

  // Delegación para eliminar etiquetas (clic en la ×)
  const listaEtiquetas = document.getElementById('lista-etiquetas');
  if (listaEtiquetas) {
    listaEtiquetas.addEventListener('click', (e) => {
      const btnEliminar = e.target.closest('.etiqueta-remove');
      if (btnEliminar) {
        const etiqueta = btnEliminar.dataset.etiqueta;
        eliminarEtiquetaDesdeUI(etiqueta);
      }
    });
  }

  // Guardar nota interna
  const btnGuardarNota = document.getElementById('guardar-nota');
  if (btnGuardarNota) btnGuardarNota.addEventListener('click', guardarNota);
}

document.addEventListener('DOMContentLoaded', init);
