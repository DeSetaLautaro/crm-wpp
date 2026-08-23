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
const upload = multer({ storage });

const auth = require('../middlewares/auth');
const { loginConPin } = require('../controllers/authController');
const {
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
} = require('../controllers/whatsappController');

// Verificación del webhook (GET)
router.get('/webhook', verificarWebhook);

// Recepción de mensajes entrantes (POST)
router.post('/webhook', recibirMensaje);

// Login con PIN para acceder al CRM
router.post('/login-pin', loginConPin);

// Obtener uso de conversaciones en las últimas 24 h
router.get('/uso-conversaciones', auth, obtenerUsoConversaciones);

// Envío de mensaje desde el dashboard (POST)
router.post('/enviar', auth, enviarMensaje);

// Actualización del estado botActivo de la empresa (PUT)
router.put('/bot-activo', auth, actualizarBotActivo);

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

// Obtener configuración actual (prompt, atajos, estado, bienvenida)
router.get('/config', auth, obtenerConfig);

// Actualizar configuración general (foto, estado, prompt y atajos)
router.put('/config', auth, upload.single('foto'), actualizarConfig);

module.exports = router;

