const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const {
  verificarWebhook,
  recibirMensaje,
  enviarMensaje,
  actualizarBotActivo,
  actualizarContacto,
  obtenerPedidoActivo,
  agregarEtiqueta,
  eliminarEtiqueta,
  agregarNota
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

// Obtener pedido en curso / último pedido de una conversación (GET)
router.get('/conversacion/:conversacionId/pedido-activo', auth, obtenerPedidoActivo);

// Agregar etiqueta a un contacto (POST)
router.post('/contacto/:contactoId/etiquetas', auth, agregarEtiqueta);

// Eliminar etiqueta de un contacto (DELETE)
router.delete('/contacto/:contactoId/etiquetas/:etiqueta', auth, eliminarEtiqueta);

// Agregar nota interna a un contacto (POST)
router.post('/contacto/:contactoId/notas', auth, agregarNota);

module.exports = router;

