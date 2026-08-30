require('dotenv').config();

// Verificar variables críticas antes de arrancar
const variablesObligatorias = ['JWT_SECRET', 'WHATSAPP_APP_SECRET', 'WHATSAPP_WEBHOOK_VERIFY_TOKEN'];
const faltantes = variablesObligatorias.filter(v => !process.env[v]);
if (faltantes.length > 0) {
  console.error(`❌ Faltan variables de entorno: ${faltantes.join(', ')}`);
  process.exit(1);
}

const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const whatsappRoutes = require('./routes/whatsappRoutes');
const pedidosRoutes = require('./routes/pedidosRoutes');
const difusionRoutes = require('./routes/difusionRoutes');
const agentesRoutes = require('./routes/agentesRoutes');
const auth = require('./middlewares/auth');
const cron = require('node-cron');
const { iniciarCronHorarios } = require('./services/horariosCron');
const { actualizarCostosDeTodasLasEmpresas } = require('./services/metaAnalyticsService');
const { obtenerConversaciones, obtenerMensajesConversacion, buscarMensajes } = require('./controllers/conversacionesController');
const { enviarDifusionesProgramadas } = require('./controllers/difusionController');

const app = express();

// Helmet bloquea cabeceras HTTP vulnerables de forma automática
app.use(helmet());

// CORS define explícitamente quién puede consumir la API.
// En producción podés setear CORS_ORIGIN = https://tu-dominio.com (separado por comas)
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['*'];
app.use(cors({
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: !allowedOrigins.includes('*')
}));

// Rate Limiting previene ataques de fuerza bruta
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 500, // Máximo 500 peticiones por IP en ese bloque de tiempo
    message: 'Demasiados intentos. Por favor, esperá 15 minutos.'
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Demasiados intentos de login. Esperá 15 minutos y volvé a intentar.'
});

// Aplicación del limitador a la ruta general de la API/Webhook
app.use('/api', limiter);

// Solicitudes al login por PIN son particularmente sensibles
app.use('/api/whatsapp/login-pin', loginLimiter);

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

// Endpoint protegido para servidores de archivos subidos (fotos de perfil, etc.)
app.get('/uploads/:filename', auth, (req, res) => {
  const filename = req.params.filename;
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Nombre de archivo inválido' });
  }
  const filePath = path.join(__dirname, 'uploads', filename);
  res.sendFile(filePath);
});

// Endpoint para listar conversaciones de la Parrilla (protegido)
app.get('/api/conversaciones', auth, obtenerConversaciones);
app.get('/api/conversaciones/:id/mensajes', auth, obtenerMensajesConversacion);
app.get('/api/mensajes/buscar', auth, buscarMensajes);

app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/difusiones', difusionRoutes);
app.use('/api/admin/agentes', auth, agentesRoutes);

// ===== Manejo de errores global =====
app.use((err, req, res, next) => {
  console.error('Error global:', err);
  const status = err.status || 500;
  const mensaje = status === 500 ? 'Error interno del servidor' : err.message;
  res.status(status).json({ error: mensaje });
});

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
