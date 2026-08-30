const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const AuditLogSchema = new Schema(
  {
    empresaId: {
      type: Types.ObjectId,
      ref: 'Empresa',
      default: null
    },
    usuarioId: {
      type: String,
      default: ''
    },
    usuarioNombre: {
      type: String,
      default: ''
    },
    rol: {
      type: String,
      default: ''
    },
    accion: {
      type: String,
      required: true
    },
    descripcion: {
      type: String,
      default: ''
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    ip: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', AuditLogSchema);
