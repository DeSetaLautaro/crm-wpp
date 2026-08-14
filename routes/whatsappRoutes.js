const express = require('express');
const router = express.Router();

const {
  verificarWebhook,
  recibirMensaje
} = require('../controllers/whatsappController');

// Verificación del webhook (GET)
router.get('/webhook', verificarWebhook);

// Recepción de mensajes entrantes (POST)
router.post('/webhook', recibirMensaje);

module.exports = router;
