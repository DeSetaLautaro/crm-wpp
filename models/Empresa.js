const mongoose = require('mongoose');
const { Schema } = mongoose;
const bcrypt = require('bcryptjs');

const EmpresaSchema = new Schema(
  {
    nombre: {
      type: String,
      required: true
    },
    
    // 1. EL PUENTE: Conecta este bot con el usuario dueño en la App de Delivery
    usuarioAppId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Usuario', // O como se llame tu modelo en la App Delivery
      required: true 
    },

    // 2. LA LLAVE DE ACCESO: El PIN para entrar al CRM aislado
    pinCrm: {
      type: String,
      required: true // Ej: "8899"
    },

    // 3. WHATSAPP: Para saber a qué número le escribieron
    whatsappPhoneId: {
      type: String,
      required: true
    },

    // 4. WHATSAPP: El token de acceso de Meta para poder enviar mensajes
    tokenMeta: {
      type: String,
      required: true
    },

    // 5. IA: El contexto o personalidad de la IA para este local
    promptIA: {
      type: String,
      default: ''
    },

    // 6. ESTADO: Para prender o apagar el bot
    botActivo: {
      type: Boolean,
      default: true
    },
 
    pin: { type: String}
  },
  
  { timestamps: true }
  
);

// Podes seguir llamándolo 'Empresa' o 'BotCRM', para Mongoose es lo mismo

// Hashear el PIN antes de guardar
EmpresaSchema.pre('save', async function (next) {
  if (!this.isModified('pinCrm')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.pinCrm = await bcrypt.hash(this.pinCrm, salt);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Empresa', EmpresaSchema);
