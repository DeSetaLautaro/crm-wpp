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
      type: [
        {
          nombre: { type: String, default: '' },
          aplicadaPor: { type: String, default: '' },
          fecha: { type: Date, default: Date.now },
          sucursal: { type: String, default: '' }
        }
      ],
      default: []
    },
    notas: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contacto', ContactoSchema);
