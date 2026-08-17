const mongoose = require('mongoose');

const { Schema, Types } = mongoose;

const ContactoSchema = new Schema(
  {
    empresaId: {
      type: Types.ObjectId,
      ref: 'Empresa',
      required: true
    },
    telefono: {
      type: String,
      required: true
    },
    nombre: {
      type: String,
      default: ''
    },
    direccion: {
      type: String,
      default: ''
    },
    pisoDepto: {
      type: String,
      default: ''
    },
    codigoPostal: {
      type: String,
      default: ''
    },
    etiquetas: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contacto', ContactoSchema);
