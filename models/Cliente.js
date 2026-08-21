const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const ClienteSchema = new Schema(
  {
    localId: {
      type: Types.ObjectId,
      ref: 'Usuario',
      default: null
    },
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
    },
    notas: {
      type: [String],
      default: []
    },
    cantidadPedidos: {
      type: Number,
      default: 0
    },
    direcciones: {
      type: [String],
      default: []
    },
    ultimaFechaPedido: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cliente', ClienteSchema, 'clientes');
