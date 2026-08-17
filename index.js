require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const whatsappRoutes = require('./routes/whatsappRoutes');
const auth = require('./middlewares/auth');
const { obtenerConversaciones } = require('./controllers/conversacionesController');
const Usuario = require('./models/usuario');

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// Endpoint para listar conversaciones de la Parrilla (protegido)
app.get('/api/conversaciones', auth, obtenerConversaciones);

// Endpoint para obtener datos del usuario (nombreSucursal y telefonosWhatsApp)
app.get('/api/usuario', auth, async (req, res) => {
  try {
    const usuarioId = req.parrillaId || req.usuario?.id;
    if (!usuarioId) {
      return res.status(400).json({ error: 'No se pudo identificar el usuario' });
    }
    const usuario = await Usuario.findById(usuarioId).lean();
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({
      ok: true,
      usuario: {
        nombreSucursal: usuario.nombreSucursal,
        telefonosWhatsApp: usuario.telefonosWhatsApp || []
      }
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ error: 'Error interno al obtener usuario' });
  }
});

app.use('/api/whatsapp', whatsappRoutes);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/crm';

const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join', (empresaId) => {
    if (empresaId) socket.join(empresaId);
  });
});

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB conectado correctamente');
    server.listen(PORT, () => {
      console.log(`Servidor escuchando en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error al conectar a MongoDB:', err.message);
    process.exit(1);
  });
