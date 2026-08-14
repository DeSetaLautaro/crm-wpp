require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');

const whatsappRoutes = require('./routes/whatsappRoutes');

const app = express();

app.use(express.json());

app.use('/api/whatsapp', whatsappRoutes);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/crm';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB conectado correctamente');
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error al conectar a MongoDB:', err.message);
    process.exit(1);
  });
