require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const whatsappRoutes = require('./routes/whatsappRoutes');
const pedidosRoutes = require('./routes/pedidosRoutes');
const difusionRoutes = require('./routes/difusionRoutes');
const auth = require('./middlewares/auth');
const cron = require('node-cron');
const { iniciarCronHorarios } = require('./services/horariosCron');
const { actualizarCostosDeTodasLasEmpresas } = require('./services/metaAnalyticsService');
const { obtenerConversaciones } = require('./controllers/conversacionesController');
const { enviarDifusionesProgramadas } = require('./controllers/difusionController');

const app = express();

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
// ====== ESTÁTICOS (SOLO ARCHIVOS PERMITIDOS) ======
app.disable('x-powered-by');
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/panel.js', (req, res) => res.sendFile(path.join(__dirname, 'panel.js')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.use('/views', express.static(path.join(__dirname, 'views')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Endpoint para listar conversaciones de la Parrilla (protegido)
app.get('/api/conversaciones', auth, obtenerConversaciones);

app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/difusiones', difusionRoutes);

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
    // Actualizar costos de Meta al iniciar
    actualizarCostosDeTodasLasEmpresas(io).catch(err => console.error('Error al actualizar costos al inicio:', err));
    iniciarCronHorarios();
    cron.schedule('* * * * *', () => {
      enviarDifusionesProgramadas().catch(err => console.error('Error en cron de difusiones programadas:', err));
    });
    cron.schedule('0 */2 * * *', () => {
      actualizarCostosDeTodasLasEmpresas(io).catch(err => console.error('Error en cron de costos Meta:', err));
    });
  })
  .catch((err) => {
    console.error('Error al conectar a MongoDB:', err.message);
    process.exit(1);
  });
