const mongoose = require('mongoose');

const { Schema, Types } = mongoose;

const MensajeSchema = new Schema(
  {
    conversacionId: {
      type: Types.ObjectId,
      ref: 'Conversacion',
      required: true
    },
    remitente: {
      type: String,
      enum: ['cliente', 'bot', 'humano', 'nota_interna'],
      required: true
    },
    contenido: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Mensaje', MensajeSchema);
