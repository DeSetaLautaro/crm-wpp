const mongoose = require('mongoose');

const { Schema } = mongoose;

const EmpresaSchema = new Schema(
  {
    nombre: {
      type: String,
      required: true
    },
    whatsappPhoneId: {
      type: String,
      required: true
    },
    promptIA: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Empresa', EmpresaSchema);
