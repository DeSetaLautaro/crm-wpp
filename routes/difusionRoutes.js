const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const {
  listarDifusiones,
  crearDifusion,
  enviarDifusion,
  obtenerContactosPorEtiqueta
} = require('../controllers/difusionController');

router.get('/', auth, listarDifusiones);
router.post('/', auth, crearDifusion);
router.get('/contactos', auth, obtenerContactosPorEtiqueta);
router.post('/:id/enviar', auth, enviarDifusion);

module.exports = router;
