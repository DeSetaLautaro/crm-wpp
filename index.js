require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const whatsappRoutes = require('./routes/whatsappRoutes');
const pedidosRoutes = require('./routes/pedidosRoutes');
const auth = require('./middlewares/auth');
const { obtenerConversaciones } = require('./controllers/conversacionesController');

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// Endpoint para listar conversaciones de la Parrilla (protegido)
app.get('/api/conversaciones', auth, obtenerConversaciones);

app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/pedidos', pedidosRoutes);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/crm';

const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join', (empresaId) => {
    if (empresaId) {
      const sala = String(empresaId);
      socket.join(sala);
      console.log(`📡 Socket unido a sala: ${sala}`);
    }
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
