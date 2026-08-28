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
      enum: ['cliente', 'bot', 'ia', 'humano', 'nota_interna', 'empresa'],
      required: true
    },
    whatsappMsgId: {
      type: String,
      default: ''
    },
    contenido: {
      type: String,
      required: true
    },
    estado: {
      type: String,
      enum: ['enviado', 'entregado', 'leido'],
      default: 'enviado'
    },
    fechaEstado: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Mensaje', MensajeSchema);
