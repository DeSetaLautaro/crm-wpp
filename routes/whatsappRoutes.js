const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const {
  verificarWebhook,
  recibirMensaje,
  enviarMensaje
} = require('../controllers/whatsappController');

// Verificación del webhook (GET)
router.get('/webhook', verificarWebhook);

// Recepción de mensajes entrantes (POST)
router.post('/webhook', recibirMensaje);

// Envío de mensaje desde el dashboard (POST)
router.post('/enviar', auth, enviarMensaje);

module.exports = router;
