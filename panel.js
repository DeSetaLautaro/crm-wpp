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
let etiquetaFiltrada = null;

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

function filtrarPorContacto(conversaciones, texto) {
  const term = (texto || '').toLowerCase().trim();
  if (!term) return conversaciones;

  return conversaciones.filter(conv => {
    const contacto = getContactoPorId(conv.contactoId);
    const nombre = (contacto?.nombre || '').toLowerCase();
    const telefono = (contacto?.telefono || '').toLowerCase();
    const etiquetasTexto = (contacto?.etiquetas || []).map(e => e.toLowerCase()).join(' ');
    return nombre.includes(term) || telefono.includes(term) || etiquetasTexto.includes(term);
  });
}

function filtrarPorMensaje(conversaciones, texto) {
  const term = (texto || '').toLowerCase().trim();
  if (!term) return [];

  return conversaciones.filter(conv => {
    const mensajes = MENSAJES.filter(m => m.conversacionId === conv._id);
    return mensajes.some(m => (m.contenido || '').toLowerCase().includes(term));
  });
}

function requiereAtencionHumana(conv) {
  if (conv.botActivo) return false;
  const msgs = getMensajesDeConversacion(conv._id);
  if (msgs.length === 0) return true;
  const ultimo = msgs[msgs.length - 1];
  return ultimo.remitente === 'cliente';
}

function botonAccionChat(conv) {
  if (conv.estado === 'Resuelto') {
    return `<button class="chat-item-accion" data-accion="reabrir" data-conv-id="${conv._id}" title="Volver a bot inactivo">↩️</button>`;
  }
  if (!conv.botActivo) {
    return `<button class="chat-item-accion" data-accion="atender" data-conv-id="${conv._id}" title="Marcar como atendido">✅</button>`;
  }
  return '';
}

// ===== Renderers =====
function colorFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 65%, 45%)`;
}

function buildChatItemHTML(conv, contacto, inicial, requiereAtencionClase, indicadorClase, activaClase) {
  return `
          <div class="chat-item ${activaClase} ${requiereAtencionClase}" data-conv-id="${conv._id}">
            <div class="chat-item-avatar">${inicial}</div>
            <div class="chat-item-contenido">
              <div class="chat-item-titulo">
                <span class="chat-item-nombre">${contacto.nombre}</span>
                <span class="chat-item-hora">${formatearHora(conv.ultimaFecha)}</span>
              </div>
              <div class="chat-item-linea">${conv.numeroReceptor || conv.lineaReceptora}</div>
              <div class="chat-item-ultimo">${conv.ultimoMensaje}</div>
              <div class="chat-item-etiquetas">${(contacto.etiquetas || []).map(et => `<span class="chat-chip-etiqueta" data-etiqueta="${et}">${et}</span>`).join('')}</div>
            </div>
            ${botonAccionChat(conv)}
            <div class="chat-item-indicador ${indicadorClase}" title="${conv.botActivo ? 'Bot activo' : 'Requiere humano'}"></div>
          </div>
        `;
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
  const buscador = (document.getElementById('buscador') || {}).value || '';
  const filtrados = base.filter(c =>
    !whatsappSeleccionado ? true : c.lineaReceptora === whatsappSeleccionado
  );

  const conFiltroEtiqueta = etiquetaFiltrada
    ? filtrados.filter(c => {
        const contacto = getContactoPorId(c.contactoId);
        const etiquetas = (contacto?.etiquetas || []).map(e => e.toLowerCase());
        return etiquetas.includes(etiquetaFiltrada.toLowerCase());
      })
    : filtrados;

  const filtrar = (lista) => lista.filter(c =>
    !whatsappSeleccionado ? true : c.lineaReceptora === whatsappSeleccionado
  );

  let htmlFinal = '';

  if (buscador.trim() !== '') {
    const porContacto = filtrar(filtrarPorContacto(conFiltroEtiqueta, buscador));
    const porMensaje = filtrar(filtrarPorMensaje(conFiltroEtiqueta, buscador));

    if (porContacto.length > 0) {
      htmlFinal += `<div class="resultado-seccion-titulo">Chats</div>`;
      htmlFinal += porContacto.map(conv => {
        const contacto = getContactoPorId(conv.contactoId);
        const inicial = (contacto.nombre || '?').charAt(0).toUpperCase();
        const requiereAtencionClase = requiereAtencionHumana(conv) ? 'requiere-atencion' : '';
        const indicadorClase = conv.botActivo ? 'activo' : 'requiere-atencion-ind';
        const activaClase = conv._id === chatActivoId ? 'activo' : '';
        return buildChatItemHTML(conv, contacto, inicial, requiereAtencionClase, indicadorClase, activaClase);
      }).join('');
    }

    if (porMensaje.length > 0) {
      htmlFinal += `<div class="resultado-seccion-titulo">Mensajes</div>`;
      htmlFinal += porMensaje.map(conv => {
        const contacto = getContactoPorId(conv.contactoId);
        const inicial = (contacto.nombre || '?').charAt(0).toUpperCase();
        const requiereAtencionClase = requiereAtencionHumana(conv) ? 'requiere-atencion' : '';
        const indicadorClase = conv.botActivo ? 'activo' : 'requiere-atencion-ind';
        const activaClase = conv._id === chatActivoId ? 'activo' : '';
        return buildChatItemHTML(conv, contacto, inicial, requiereAtencionClase, indicadorClase, activaClase);
      }).join('');
    }

    if (!porContacto.length && !porMensaje.length) {
      htmlFinal = '<div class="sin-resultados">Sin resultados</div>';
    }

    container.innerHTML = htmlFinal;

    document.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.chat-item-accion') || e.target.closest('.chat-chip-etiqueta')) return;
        chatActivoId = item.dataset.convId;
        renderTodo();
      });
    });

    return;
  }

  container.innerHTML = conFiltroEtiqueta.map(conv => {
    const contacto = getContactoPorId(conv.contactoId);
    const inicial = (contacto.nombre || '?').charAt(0).toUpperCase();
    const requiereAtencionClase = requiereAtencionHumana(conv) ? 'requiere-atencion' : '';
    const indicadorClase = conv.botActivo ? 'activo' : 'requiere-atencion-ind';
    const activaClase = conv._id === chatActivoId ? 'activo' : '';
    return buildChatItemHTML(conv, contacto, inicial, requiereAtencionClase, indicadorClase, activaClase);
  }).join('');

  document.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.chat-item-accion') || e.target.closest('.chat-chip-etiqueta')) return;
      chatActivoId = item.dataset.convId;
      renderTodo();
    });
  });
}

function armarHeaderMovil(contacto, conv) {
  const chatHeader = document.querySelector('.chat-header');
  if (!chatHeader) return;

  // Avatar con inicial al lado de la flecha "volver"
  let avatar = document.getElementById('chat-avatar-movil');
  if (!avatar) {
    avatar = document.createElement('div');
    avatar.id = 'chat-avatar-movil';
    avatar.className = 'chat-avatar-movil';
    const backBtn = document.getElementById('btn-volver');
    if (backBtn && backBtn.nextSibling) {
      chatHeader.insertBefore(avatar, backBtn.nextSibling);
    } else {
      chatHeader.insertBefore(avatar, chatHeader.firstChild?.nextSibling || chatHeader.firstChild);
    }
  }
  avatar.textContent = (contacto.nombre || '?').charAt(0).toUpperCase();

 /* // Botón teléfono (solo visible en celular)
  let btnTel = document.getElementById('btn-llamar-movil');
  if (!btnTel) {
    btnTel = document.createElement('a');
    btnTel.id = 'btn-llamar-movil';
    btnTel.className = 'btn-llamar-movil';
    btnTel.textContent = '📞';
    btnTel.title = 'Llamar';
    const toggleWrap = document.querySelector('.toggle-wrapper');
    if (toggleWrap) toggleWrap.parentNode.insertBefore(btnTel, toggleWrap);
  }
  btnTel.href = `tel:${contacto.telefono || ''}`;*/

  // Botón "⋯" que abre el menú en celular
  let btnMenu = document.getElementById('btn-mas-movil');
  if (!btnMenu) {
    btnMenu = document.createElement('button');
    btnMenu.id = 'btn-mas-movil';
    btnMenu.className = 'btn-mas-movil';
    btnMenu.textContent = '⋯';
    btnMenu.title = 'Más opciones';
    const toggleWrap2 = document.querySelector('.toggle-wrapper');
    if (toggleWrap2) toggleWrap2.parentNode.insertBefore(btnMenu, toggleWrap2.nextSibling);
    btnMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('menu-movil');
      if (menu) menu.classList.toggle('hidden');
    });
  }

  // Menú flotante (Bloquear / Detalles / Notas)
  let menu = document.getElementById('menu-movil');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'menu-movil';
    menu.className = 'menu-movil hidden';
    document.body.appendChild(menu);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#menu-movil') && !e.target.closest('#btn-mas-movil')) {
        menu.classList.add('hidden');
      }
    });
  }

  const bloqueado = contacto.bloqueado;
  menu.innerHTML = `
    <div class="menu-movil-item" id="menu-movil-llamar">📞 Llamar</div>
    <div class="menu-movil-item" id="menu-movil-bloquear">${bloqueado ? '🔓 Desbloquear' : '🔒 Bloquear'}</div>
    <div class="menu-movil-item" id="menu-movil-detalles">👁 Ver detalles</div>
    <div class="menu-movil-item" id="menu-movil-notas">📝 Notas / Archivos</div>
  `;

  document.getElementById('menu-movil-bloquear').onclick = () => {
    menu.classList.add('hidden');
    confirmarBloqueoCliente();
  };

  document.getElementById('menu-movil-detalles').onclick = () => {
    menu.classList.add('hidden');
    abrirDetallesDesdeMenu();
  };

  document.getElementById('menu-movil-notas').onclick = () => {
    menu.classList.add('hidden');
    abrirArchivosNotasDesdeMenu();
  };

  document.getElementById('menu-movil-llamar').onclick = () => {
    menu.classList.add('hidden');
    window.location.href = `tel:${contacto.telefono || ''}`;
  };
}

function armarBotonCerrarPerfilMovil() {
  const perfilHeader = document.querySelector('.perfil-header');
  if (!perfilHeader) return;
  if (document.getElementById('btn-cerrar-perfil-movil')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-cerrar-perfil-movil';
  btn.className = 'btn-cerrar-perfil-movil';
  btn.textContent = '←';
  btn.title = 'Volver al chat';
  btn.addEventListener('click', () => {
    document.getElementById('app').classList.remove('perfil-abierto');
    document.getElementById('modal-detalles')?.classList.add('hidden');
  });
  perfilHeader.insertBefore(btn, perfilHeader.firstChild);
}

function abrirDetallesDesdeMenu() {
  const app = document.getElementById('app');
  if (app) app.classList.add('perfil-abierto');
  abrirDetallesModal();
}

function abrirArchivosNotasDesdeMenu() {
  const app = document.getElementById('app');
  if (app) app.classList.add('perfil-abierto');
  const modal = document.getElementById('modal-detalles');
  if (modal) modal.classList.add('hidden');

  const panelNotas = document.getElementById('notas-panel');
  const panelArchivos = document.getElementById('archivos-panel');
  if (panelNotas) panelNotas.classList.remove('hidden');
  if (panelArchivos) panelArchivos.classList.add('hidden');
}

function renderChatActivo() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;

  const contacto = getContactoPorId(conv.contactoId);
  const toggle = document.getElementById('toggle-bot');
  const estadoBot = document.getElementById('estado-bot');

  armarHeaderMovil(contacto, conv);

  document.getElementById('chat-nombre').textContent = contacto.nombre;
  document.getElementById('chat-linea').textContent = conv.numeroReceptor || conv.lineaReceptora;

  // Mostrar etiquetas del contacto en el header del chat
  const lineaHeader = document.getElementById('chat-linea');
  let etiquetasHeader = document.getElementById('chat-etiquetas');
  if (!etiquetasHeader && lineaHeader && lineaHeader.parentNode) {
    etiquetasHeader = document.createElement('div');
    etiquetasHeader.id = 'chat-etiquetas';
    etiquetasHeader.className = 'chat-etiquetas';
    lineaHeader.parentNode.insertBefore(etiquetasHeader, lineaHeader.nextSibling);
  }
  if (etiquetasHeader) {
    const etiquetas = Array.isArray(contacto.etiquetas) ? contacto.etiquetas : [];
    etiquetasHeader.innerHTML = etiquetas.map(etiqueta => {
      const color = colorFromString(etiqueta);
      return `<span style="background:${color}22; border:1px solid ${color}; border-radius:12px; padding:2px 8px; font-size:12px; margin-right:4px; color:${color};">
                ${etiqueta}
                <button class="etiqueta-remove" data-etiqueta="${etiqueta}" style="background:none; border:none; color:inherit; margin-left:4px; cursor:pointer; font-size:12px;">×</button>
              </span>`;
    }).join('');
  }

  toggle.checked = conv.botActivo;
  estadoBot.textContent = conv.botActivo ? 'Bot Activo' : 'Pausado';

  // ===== Candado de cliente bloqueado =====
  let lockInd = document.getElementById('bloqueado-indicador');
  if (!lockInd) {
    const toggleEl = document.getElementById('toggle-bot');
    if (toggleEl && toggleEl.parentNode) {
      lockInd = document.createElement('span');
      lockInd.id = 'bloqueado-indicador';
      lockInd.style.marginLeft = '8px';
      lockInd.style.fontSize = '14px';
      lockInd.style.color = '#ef4444';
      toggleEl.parentNode.insertBefore(lockInd, toggleEl.nextSibling);
    }
  }
  if (lockInd) {
    if (contacto.bloqueado) {
      lockInd.textContent = ' 🔒';
      lockInd.title = 'Cliente bloqueado';
      lockInd.style.display = 'inline';
    } else {
      lockInd.textContent = '';
      lockInd.style.display = 'none';
    }
  }

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
  if (inputDireccion) inputDireccion.value = contacto.direccionFrecuente || contacto.direccion || '';
  if (inputPisoDepto) inputPisoDepto.value = contacto.pisoDepto || '';
  if (inputCodigoPostal) inputCodigoPostal.value = contacto.codigoPostal || '';
  const nombreTexto = document.getElementById('perfil-nombre-texto');
  if (nombreTexto) nombreTexto.textContent = nombre;
  const telefonoTexto = document.getElementById('perfil-telefono-texto');
  if (telefonoTexto) telefonoTexto.textContent = telefono;
  const avatar = document.getElementById('perfil-avatar');
  if (avatar) avatar.textContent = (nombre || '?').charAt(0).toUpperCase();

  const contEtiquetas = document.getElementById('lista-etiquetas');
  if (contEtiquetas) {
    // Las etiquetas se muestran en el header del chat, por eso acá no se muestra nada.
    contEtiquetas.innerHTML = '';
  }

  const contNotas = document.getElementById('lista-notas');
  if (contNotas) {
    const notas = Array.isArray(contacto.notas) ? contacto.notas : [];
    if (notas.length === 0) {
      contNotas.innerHTML = '<span class="notas-vacio">Sin notas internas</span>';
    } else {
      contNotas.innerHTML = notas.map(n => `
        <div class="nota-item">
          <span class="nota-item-texto">${n}</span>
          <button class="nota-remove-btn" data-nota="${encodeURIComponent(n)}" title="Eliminar nota">×</button>
        </div>
      `).join('');
    }
  }

  // Eliminar el botón original "Detalles" para que no compita con los ítems nuevos
  const btnOriginalDetalles = document.getElementById('btn-detalles-modal');
  if (btnOriginalDetalles && btnOriginalDetalles.parentNode) {
    btnOriginalDetalles.parentNode.removeChild(btnOriginalDetalles);
  }

  // Opción de bloqueo dentro del menú del perfil (tres puntos)
  const perfilMenu = document.getElementById('perfil-menu');
  if (perfilMenu) {
    let itemBloqueo = document.getElementById('menu-item-bloquear');
    if (!itemBloqueo) {
      itemBloqueo = document.createElement('div');
      itemBloqueo.id = 'menu-item-bloquear';
      itemBloqueo.className = 'perfil-menu-item';
      perfilMenu.appendChild(itemBloqueo);
    }
    itemBloqueo.textContent = contacto.bloqueado ? '🔓 Desbloquear' : '🔒 Bloquear';
    itemBloqueo.onclick = () => {
      perfilMenu.classList.add('hidden');
      confirmarBloqueoCliente();
    };

    let itemDetalles = document.getElementById('menu-item-detalles');
    if (!itemDetalles) {
      itemDetalles = document.createElement('div');
      itemDetalles.id = 'menu-item-detalles';
      itemDetalles.className = 'perfil-menu-item';
      perfilMenu.appendChild(itemDetalles);
    }
    itemDetalles.textContent = '👁 Ver detalles';
    itemDetalles.onclick = () => {
      perfilMenu.classList.add('hidden');
      abrirDetallesDesdeMenu();
    };

    let itemArchivos = document.getElementById('menu-item-archivos');
    if (!itemArchivos) {
      itemArchivos = document.createElement('div');
      itemArchivos.id = 'menu-item-archivos';
      itemArchivos.className = 'perfil-menu-item';
      perfilMenu.appendChild(itemArchivos);
    }
    itemArchivos.textContent = '📝 Notas / Archivos';
    itemArchivos.onclick = () => {
      perfilMenu.classList.add('hidden');
      abrirArchivosNotasDesdeMenu();
    };

    let itemLlamar = document.getElementById('menu-item-llamar');
    if (!itemLlamar) {
      itemLlamar = document.createElement('div');
      itemLlamar.id = 'menu-item-llamar';
      itemLlamar.className = 'perfil-menu-item';
      perfilMenu.appendChild(itemLlamar);
    }
    itemLlamar.textContent = '📞 Llamar';
    itemLlamar.onclick = () => {
      perfilMenu.classList.add('hidden');
      window.location.href = `tel:${contacto.telefono || ''}`;
    };
  }
}

function renderTodo() {
  renderListaChats();
  renderChatActivo();
  updateVisibilidad();

  const appEl = document.getElementById('app');
  if (appEl) {
    if (chatActivoId) {
      appEl.classList.add('chat-abierto');
    } else {
      appEl.classList.remove('chat-abierto');
    }
  }
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

function previewFoto() {
  const input = document.getElementById('config-foto');
  const preview = document.getElementById('config-foto-preview');
  if (!input || !preview) return;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    preview.src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function guardarConfigDesdePanel() {
  const estadoEl = document.getElementById('config-estado');
  const estado = (estadoEl?.value || '').trim();
  const inputFoto = document.getElementById('config-foto');
  const formData = new FormData();
  formData.append('estado', estado);
  if (inputFoto && inputFoto.files && inputFoto.files.length > 0) {
    formData.append('foto', inputFoto.files[0]);
  }
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch('/api/whatsapp/config', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Error al guardar config:', data.error || res.status);
      alert('Error al guardar configuración');
      return;
    }
    alert('Configuración guardada correctamente');
  } catch (error) {
    console.error('Error de red al guardar config:', error);
  }
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

    if (res.status === 401) {
      localStorage.removeItem('token');
      mostrarModalLogin();
      return;
    }

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
        numeroReceptor: conv.numeroReceptor || '',
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

    // Obtener empresas del usuario para armar el selector
    const empresasInfo = data.empresas || [];
    if (empresasInfo.length > 0) {
      poblarSelectorWhatsApp(empresasInfo);
    } else {
      // Fallback: si el backend aún no devuelve empresas, usamos las líneas de las conversaciones
      const lineas = Array.from(new Set(conversacionesLocal.map(c => c.lineaReceptora).filter(Boolean)));
      poblarSelectorWhatsApp(lineas);
      if (lineas.length > 0 && (!whatsappSeleccionado || !lineas.includes(whatsappSeleccionado))) {
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

    if (socket) {
      const salas = [...new Set(conversacionesLocal.map(c => c.empresaId).filter(Boolean))];
      salas.forEach(sala => socket.emit('join', sala));
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

function poblarSelectorWhatsApp(items) {
  const select = document.getElementById('select-whatsapp');
  if (!select) return;
  select.innerHTML = '';

  // Opción "Todas las líneas"
  const optAll = document.createElement('option');
  optAll.value = '';
  optAll.textContent = 'Todas las líneas';
  select.appendChild(optAll);

  if (!items || items.length === 0) {
    select.value = '';
    whatsappSeleccionado = '';
    return;
  }

  const esObjeto = typeof items[0] === 'object' && items[0] !== null;

  items.forEach(item => {
    const opt = document.createElement('option');
    if (esObjeto) {
      opt.value = item.whatsappPhoneId;
      opt.textContent = `${item.nombre} (${item.whatsappPhoneId})`;
    } else {
      opt.value = item;
      opt.textContent = item;
    }
    select.appendChild(opt);
  });

  // Selección inicial: primera empresa / línea, o la que ya estaba
  if (esObjeto) {
    const lineas = items.map(e => e.whatsappPhoneId);
    if (!whatsappSeleccionado || !lineas.includes(whatsappSeleccionado)) {
      whatsappSeleccionado = lineas[0];
      select.value = whatsappSeleccionado;
    } else {
      select.value = whatsappSeleccionado;
    }
  } else {
    const lineas = items;
    if (!whatsappSeleccionado || !lineas.includes(whatsappSeleccionado)) {
      whatsappSeleccionado = lineas[0];
      select.value = whatsappSeleccionado;
    } else {
      select.value = whatsappSeleccionado;
    }
  }
}

function setupSocketListeners() {
  if (!socket) return;

  socket.on('connect', () => {
    const salas = [...new Set(CONVERSACIONES.map(c => c.empresaId).filter(Boolean))];
    salas.forEach(sala => socket.emit('join', sala));
  });

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
      convLocal.estado = 'Abierto';
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
    const conv = getConversacionPorId(chatActivoId);
    if (conv && conv.estado !== 'Abierto') {
      conv.estado = 'Abierto';
      renderListaChats();
    }
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

  // Volver al chat: si el perfil está abierto como overlay, lo cerramos
  const app = document.getElementById('app');
  if (app) app.classList.remove('perfil-abierto');
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
async function cargarPedidoActivo(conversacionId, telefono, contactoId) {
  const token = localStorage.getItem('token') || '';
  const contenedor = document.getElementById('pedido-info');
  if (!contenedor) return;
  contenedor.innerHTML = '<span style="color:#9CA3AF;">Cargando...</span>';

  // 1. Intentar obtener pedidos desde el endpoint específico por número de teléfono
  if (telefono) {
    try {
      let url = `/api/pedidos/cliente/${encodeURIComponent(telefono)}`;
      if (contactoId) {
        url += `?contactoId=${encodeURIComponent(contactoId)}`;
      }
      const res = await fetch(url, {
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
    let html = renderCarrito(conv.carrito, conv.carritoTotal);
    const direccion = (contacto && (contacto.direccionFrecuente || contacto.direccion)) ? (contacto.direccionFrecuente || contacto.direccion) : 'No especificada';
    html += `<div class="pedido-direccion">Entrega: ${direccion}</div>`;
    contenedor.innerHTML = html;
    return;
  }

  // No hay carrito en construcción → buscamos último pedido confirmado
  cargarPedidoActivo(conv._id, contacto.telefono, contacto._id);
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

// ===== Eliminar nota interna =====
async function eliminarNotaDesdeUI(notaEncode) {
  const nota = decodeURIComponent(notaEncode);
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}/notas/${encodeURIComponent(nota)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al eliminar nota:', data.error || res.status);
      return;
    }
    const data = await res.json();
    contacto.notas = data.notas || [];
    if (chatActivoId) renderChatActivo();
  } catch (error) {
    console.error('Error de red al eliminar nota:', error);
  }
}

// ===== Guardar nota interna =====
async function marcarAtendido(convId = chatActivoId) {
  if (!convId) return;
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/conversacion/${convId}/atender`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al marcar atendido:', data.error || res.status);
      return;
    }
    const conv = getConversacionPorId(convId);
    if (conv) conv.estado = 'Resuelto';
    renderTodo();
  } catch (error) {
    console.error('Error de red al marcar atendido:', error);
  }
}

async function reabrirConversacion(convId) {
  if (!convId) return;
  const token = localStorage.getItem('token') || '';
  try {
    const res = await fetch(`/api/whatsapp/conversacion/${convId}/reabrir`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al reabrir conversación:', data.error || res.status);
      return;
    }
    const conv = getConversacionPorId(convId);
    if (conv) conv.estado = 'Abierto';
    renderTodo();
  } catch (error) {
    console.error('Error de red al reabrir conversación:', error);
  }
}

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

// ===== Bloqueo de cliente =====
function confirmarBloqueoCliente() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  // Crear overlay y modal
  const overlay = document.createElement('div');
  overlay.id = 'modal-bloqueo-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;padding:30px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:400px;text-align:center;';

  const titulo = document.createElement('h3');
  titulo.textContent = contacto.bloqueado ? '¿Desbloquear cliente?' : '¿Bloquear cliente?';
  titulo.style.marginTop = '0';

  const texto = document.createElement('p');
  texto.textContent = contacto.bloqueado
    ? 'El cliente volverá a recibir mensajes automáticos del bot.'
    : 'El cliente dejará de recibir respuestas automáticas y sus mensajes serán descartados.';

  const contBtns = document.createElement('div');
  contBtns.style.marginTop = '20px';

  const btnCancelar = document.createElement('button');
  btnCancelar.textContent = 'Cancelar';
  btnCancelar.style.cssText = 'margin-right:10px;padding:10px 20px;border:none;border-radius:8px;background:#e5e7eb;cursor:pointer;';

  const btnConfirmar = document.createElement('button');
  btnConfirmar.textContent = 'Confirmar';
  btnConfirmar.style.cssText = 'padding:10px 20px;border:none;border-radius:8px;background:#ef4444;color:#fff;cursor:pointer;';

  btnCancelar.addEventListener('click', () => overlay.remove());
  btnConfirmar.addEventListener('click', () => {
    overlay.remove();
    toggleBloqueoCliente();
  });

  contBtns.appendChild(btnCancelar);
  contBtns.appendChild(btnConfirmar);
  modal.appendChild(titulo);
  modal.appendChild(texto);
  modal.appendChild(contBtns);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

async function toggleBloqueoCliente() {
  const conv = getConversacionPorId(chatActivoId);
  if (!conv) return;
  const contacto = getContactoPorId(conv.contactoId);
  if (!contacto) return;

  const token = localStorage.getItem('token') || '';
  const ruta = contacto.bloqueado ? 'desbloquear' : 'bloquear';
  try {
    const res = await fetch(`/api/whatsapp/contacto/${contacto._id}/${ruta}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Error al cambiar estado:', data.error || res.status);
      return;
    }

    const data = await res.json();
    contacto.bloqueado = data.bloqueado;
    renderChatActivo();
  } catch (error) {
    console.error('Error de red al cambiar estado:', error);
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

  // Cerrar sesión
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('token');
      location.reload();
    });
  }

  // Configuración del Bot
  initConfigSidebar();

  // Configuración general (foto y estado)
  const btnGuardarConfigDatos = document.getElementById('btn-guardar-config-datos');
  if (btnGuardarConfigDatos) btnGuardarConfigDatos.addEventListener('click', guardarConfigDesdePanel);
  const inputFoto = document.getElementById('config-foto');
  if (inputFoto) inputFoto.addEventListener('change', previewFoto);

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

  // Buscador de chats
  const inputBuscador = document.getElementById('buscador');
  if (inputBuscador) {
    inputBuscador.addEventListener('input', () => {
      renderListaChats();
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
  document.addEventListener('click', (e) => {
    const btnEliminar = e.target.closest('.etiqueta-remove');
    if (btnEliminar) {
      const etiqueta = btnEliminar.dataset.etiqueta;
      eliminarEtiquetaDesdeUI(etiqueta);
    }
  });

  // Switch Archivos | Notas
  document.querySelectorAll('.archivos-switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.archivos-switch-btn').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      const pestana = btn.dataset.pestanaArchivo;
      document.getElementById('archivos-panel').classList.toggle('hidden', pestana !== 'archivos');
      document.getElementById('notas-panel').classList.toggle('hidden', pestana !== 'notas');
    });
  });

  // Búsqueda por etiqueta (clic en chip)
  document.addEventListener('click', (e) => {
    const chipEtiqueta = e.target.closest('.chat-chip-etiqueta');
    if (chipEtiqueta) {
      e.stopPropagation();
      const etiqueta = chipEtiqueta.dataset.etiqueta;
      if (etiquetaFiltrada && etiquetaFiltrada.toLowerCase() === etiqueta.toLowerCase()) {
        etiquetaFiltrada = null;
      } else {
        etiquetaFiltrada = etiqueta;
      }
      renderListaChats();
      return;
    }
  });

  // Eliminar nota interna (delegación)
  document.addEventListener('click', (e) => {
    const btnEliminar = e.target.closest('.nota-remove-btn');
    if (btnEliminar) {
      eliminarNotaDesdeUI(btnEliminar.dataset.nota);
    }

    // Acciones rápidas en chat-item (atender/reabrir)
    const btnAccion = e.target.closest('.chat-item-accion');
    if (!btnAccion) return;
    e.preventDefault();
    e.stopPropagation();
    const convId = btnAccion.dataset.convId;
    const accion = btnAccion.dataset.accion;
    if (accion === 'atender') marcarAtendido(convId);
    else if (accion === 'reabrir') reabrirConversacion(convId);
  });

  // Guardar nota interna
  const btnGuardarNota = document.getElementById('guardar-nota');
  if (btnGuardarNota) btnGuardarNota.addEventListener('click', guardarNota);

  // Botón "volver" para móvil
  const chatHeader = document.querySelector('.chat-header');
  if (chatHeader && !document.getElementById('btn-volver')) {
    const backBtn = document.createElement('button');
    backBtn.id = 'btn-volver';
    backBtn.className = 'btn-volver';
    backBtn.textContent = '←';
    backBtn.title = 'Volver a la lista';
    backBtn.addEventListener('click', () => {
      document.getElementById('app').classList.remove('chat-abierto');
    });
    chatHeader.insertBefore(backBtn, chatHeader.firstChild);
  }

  // Botón para cerrar la columna derecha en móvil
  armarBotonCerrarPerfilMovil();
}

function ocultarBotonLlamarEnEscritorio() {
  // Si el dispositivo tiene un puntero fino (mouse/desktop),
  // ocultamos el botón de llamada porque no tiene sentido en escritorio.
  const style = document.createElement('style');
  style.textContent = '@media (pointer: fine) { [title="Llamar"], a[title="Llamar"], button[title="Llamar"] { display: none; } }';
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', init);
document.addEventListener('DOMContentLoaded', ocultarBotonLlamarEnEscritorio);
