const mongoose = require('mongoose');
const { Schema } = mongoose;

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
    fotoPerfil: {
      type: String,
      default: ''
    },
    estado: {
      type: String,
      default: ''
    },
    bienvenida: {
      type: String,
      default: ''
    },

    // Contador de conversaciones iniciadas en las últimas 24 horas
    conversacionesUsadas24h: {
      type: Number,
      default: 0
    },
    limiteConversaciones24h: {
      type: Number,
      default: 250
    }
 
  },
  
  { timestamps: true }
  
);

// Podes seguir llamándolo 'Empresa' o 'BotCRM', para Mongoose es lo mismo

module.exports = mongoose.model('Empresa', EmpresaSchema);
