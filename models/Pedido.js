const mongoose = require('mongoose');

const { Schema, Types } = mongoose;

const itemPedidoSchema = new Schema(
  {
    nombre: {
      type: String,
      required: true
    },
    cantidad: {
      type: Number,
      required: true,
      default: 1
    },
    precioUnitario: {
      type: Number,
      required: true,
      default: 0
    }
  },
  { _id: false }
);

const PedidoSchema = new Schema(
  {
    empresaId: {
      type: Types.ObjectId,
      ref: 'Empresa',
      required: true
    },
    conversacionId: {
      type: Types.ObjectId,
      ref: 'Conversacion',
      required: true
    },
    contactoId: {
      type: Types.ObjectId,
      ref: 'Contacto',
      required: true
    },
    items: {
      type: [itemPedidoSchema],
      default: []
    },
    total: {
      type: Number,
      default: 0
    },
    estado: {
      type: String,
      enum: ['Pendiente', 'En preparación', 'Entregado', 'Cancelado'],
      default: 'Pendiente'
    },
    direccionEntrega: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Pedido', PedidoSchema);
