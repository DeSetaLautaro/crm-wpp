const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'audio/ogg',
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/amr',
      'audio/wav',
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (tiposPermitidos.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error('Tipo de archivo no permitido. Solo se permiten imágenes, audio, video, PDF, Word o Excel.');
      err.status = 400;
      cb(err, false);
    }
  }
});

const auth = require('../middlewares/auth');
const { loginConPin } = require('../controllers/authController');
const {
  verificarFirmaMeta,
  verificarWebhook,
  recibirMensaje,
  enviarMensaje,
  enviarMensajeMedia,
  reenviarMensaje,
  actualizarBotActivo,
  actualizarBotActivoConversacion,
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
  crearContactoManual,
  obtenerPlantillas,
  obtenerMonedero,
  cargarSaldoMonedero,
  actualizarCostosManual,
  actualizarConfig,
  obtenerUsoConversaciones,
  obtenerConfig,
  generarPedidoManual
} = require('../controllers/whatsappController');

// Verificación del webhook (GET)
router.get('/webhook', verificarWebhook);

// Recepción de mensajes entrantes (POST)
router.post('/webhook', verificarFirmaMeta, recibirMensaje);

// Login con PIN para acceder al CRM
router.post('/login-pin', loginConPin);

// Obtener uso de conversaciones en las últimas 24 h
router.get('/uso-conversaciones', auth, obtenerUsoConversaciones);
router.get('/meta/actualizar-costos', auth, actualizarCostosManual);

// Crear contacto manualmente desde el panel
router.post('/contactos', auth, crearContactoManual);

// Envío de mensaje desde el dashboard (POST)
router.post('/enviar', auth, enviarMensaje);

// Envío de multimedia desde el dashboard (POST)
router.post('/enviar-media', auth, upload.single('archivo'), enviarMensajeMedia);

// Reenviar mensaje fallido (POST)
router.post('/reenviar/:mensajeId', auth, reenviarMensaje);

// Actualización del estado botActivo de la empresa (PUT)
router.put('/bot-activo', auth, actualizarBotActivo);
router.put('/conversacion/:id/bot-activo', auth, actualizarBotActivoConversacion);

// Actualización de datos manuales de un cliente (PUT)
router.put('/contacto/:contactoId', auth, actualizarContacto);

// Obtener pedido en curso / último pedido de una conversación (GET)
router.get('/conversacion/:conversacionId/pedido-activo', auth, obtenerPedidoActivo);

// Marcar conversación como atendida (PUT)
router.put('/conversacion/:id/atender', auth, marcarAtendido);

// Reabrir conversación atendida (PUT)
router.put('/conversacion/:id/reabrir', auth, reabrirConversacion);

// Agregar etiqueta a un contacto (POST)
router.post('/contacto/:contactoId/etiquetas', auth, agregarEtiqueta);

// Eliminar etiqueta de un contacto (DELETE)
router.delete('/contacto/:contactoId/etiquetas/:etiqueta', auth, eliminarEtiqueta);

// Agregar nota interna a un contacto (POST)
router.post('/contacto/:contactoId/notas', auth, agregarNota);

// Eliminar nota interna de un contacto (DELETE)
router.delete('/contacto/:contactoId/notas/:nota', auth, eliminarNota);

// Bloquear cliente (PUT)
router.put('/contacto/:contactoId/bloquear', auth, bloquearCliente);

// Desbloquear cliente (PUT)
router.put('/contacto/:contactoId/desbloquear', auth, desbloquearCliente);

// Generar pedido manualmente desde el panel (analiza la conversación con IA)
router.post('/generar-pedido', auth, generarPedidoManual);

// Obtener configuración actual (prompt, atajos, estado, bienvenida)
router.get('/config', auth, obtenerConfig);

// Actualizar configuración general (foto, estado, prompt y atajos)
router.put('/config', auth, upload.single('foto'), actualizarConfig);

// ===== Monedero =====
router.get('/plantillas', auth, obtenerPlantillas);
router.get('/monedero', auth, obtenerMonedero);
router.post('/admin/monedero/cargar', auth, cargarSaldoMonedero);

module.exports = router;

