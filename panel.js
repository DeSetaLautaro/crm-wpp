// ============================================================
// CRM Omnicanal WhatsApp - Frontend Vanilla JS
// ============================================================

const USAR_MOCK_DATA = true;

// ===== Mock Data =====
// Basado en la estructura de los modelos definidos en proyecto.md

const MOCK_EMPRESA = {
  _id: 'emp1',
  nombre: 'Heladería Palermo',
  whatsappPhoneId: '5491100000000',
  promptIA: ''
};

const MOCK_CONTACTOS = [
  {
    _id: 'c1',
    empresaId: 'emp1',
    telefono: '5491100000001',
    nombre: 'Martina',
    etiquetas: [
      { nombre: 'VIP', color: '#F59E0B', creadoPor: 'Laura', sucursal: 'Palermo', fecha: new Date('2024-01-10T10:00:00') },
      { nombre: 'Quejoso', color: '#EF4444', creadoPor: 'Juan', sucursal: 'Palermo', fecha: new Date('2024-02-15T14:30:00') }
    ]
  },
  {
    _id: 'c2',
    empresaId: 'emp1',
    telefono: '5491100000002',
    nombre: 'Roberto',
    etiquetas: [
      { nombre: 'VIP', color: '#F59E0B', creadoPor: 'Laura', sucursal: 'Palermo', fecha: new Date('2024-03-01T09:00:00') }
    ]
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
let pestanaActiva = 'Abierto';
let chatActivoId = MOCK_CONVERSACIONES[0]._id;

// ===== Helpers =====
function getContactoPorId(id) {
  return MOCK_CONTACTOS.find(c => c._id === id);
}

function getConversacionPorId(id) {
  return MOCK_CONVERSACIONES.find(c => c._id === id);
}

function getMensajesDeConversacion(convId) {
  return MOCK_MENSAJES.filter(m => m.conversacionId === convId);
}

function formatearHora(fecha) {
  return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatearFechaTooltip(fecha) {
  return fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

// ===== Renderers =====
function renderListaChats() {
  const container = document.getElementById('lista-chats');
  const filtrados = MOCK_CONVERSACIONES.filter(c => c.estado === pestanaActiva);

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
    else if (msg.remitente === 'bot' || msg.remitente === 'humano') claseBurbuja = 'bubble-humano';
    else if (msg.remitente === 'nota_interna') claseBurbuja = 'bubble-nota';

    return `<div class="bubble ${claseBurbuja}">${msg.contenido}</div>`;
  }).join('');

  // Etiquetas del perfil
  renderPerfil(contacto);
}

function renderPerfil(contacto) {
  document.getElementById('perfil-nombre').value = contacto.nombre || '';
  document.getElementById('perfil-telefono').value = contacto.telefono || '';

  const contEtiquetas = document.getElementById('lista-etiquetas');
  if (contacto.etiquetas.length === 0) {
    contEtiquetas.innerHTML = '<span style="color:#9CA3AF; font-size:0.85rem">Sin etiquetas</span>';
    return;
  }

  contEtiquetas.innerHTML = contacto.etiquetas.map(etiqueta => {
    const tooltip = `Creada por: ${etiqueta.creadoPor} · Sucursal: ${etiqueta.sucursal} · ${formatearFechaTooltip(etiqueta.fecha)}`;
    return `<span class="badge-etiqueta" style="background:${etiqueta.color}" title="${tooltip}">${etiqueta.nombre}</span>`;
  }).join('');
}

function renderTodo() {
  renderListaChats();
  renderChatActivo();
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

  // Toggle del bot (solo visual, sin lógica real por ahora)
  document.getElementById('toggle-bot').addEventListener('change', (e) => {
    const estado = e.target.checked ? 'Bot Activo' : 'Pausado';
    document.getElementById('estado-bot').textContent = estado;
  });

  // Render inicial
  renderTodo();
}

document.addEventListener('DOMContentLoaded', init);
