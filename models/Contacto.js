const mongoose = require('mongoose');

const { Schema, Types } = mongoose;

const etiquetaSchema = new Schema({
  nombre: String,
  color: String,
  creadoPor: String,
  sucursal: String,
  fecha: Date
}, { _id: false });

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
      type: [etiquetaSchema],
      default: []
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contacto', ContactoSchema);
