const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const {
  verificarWebhook,
  recibirMensaje,
  enviarMensaje,
  actualizarBotActivo,
  actualizarContacto
} = require('../controllers/whatsappController');

// Verificación del webhook (GET)
router.get('/webhook', verificarWebhook);

// Recepción de mensajes entrantes (POST)
router.post('/webhook', recibirMensaje);

// Envío de mensaje desde el dashboard (POST)
router.post('/enviar', auth, enviarMensaje);

// Actualización del estado botActivo de la empresa (PUT)
router.put('/bot-activo', auth, actualizarBotActivo);

// Actualización de datos manuales de un cliente (PUT)
router.put('/contacto/:contactoId', auth, actualizarContacto);

module.exports = router;

