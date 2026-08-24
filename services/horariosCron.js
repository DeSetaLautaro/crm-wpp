const cron = require('node-cron');
const Usuario = require('../models/usuario');

function obtenerDiaActual() {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return dias[new Date().getDay()];
}

function obtenerHoraActual() {
  const ahora = new Date();
  const horas = String(ahora.getHours()).padStart(2, '0');
  const minutos = String(ahora.getMinutes()).padStart(2, '0');
  return `${horas}:${minutos}`;
}

async function ejecutarActualizacionHorarios() {
  const diaActual = obtenerDiaActual();
  const horaActual = obtenerHoraActual();

  try {
    const usuarios = await Usuario.find({
      horariosEstructurados: {
        $elemMatch: {
          dia: diaActual,
          $or: [
            { apertura: horaActual },
            { cierre: horaActual }
          ]
        }
      }
    });

    for (const usuario of usuarios) {
      const horario = usuario.horariosEstructurados.find(h =>
        h.dia === diaActual &&
        (h.apertura === horaActual || h.cierre === horaActual)
      );

      if (!horario) continue;

      if (horario.apertura === horaActual) {
        usuario.abierto = true;
        console.log(`[${horaActual}] Local ${usuario.nombreDelLocal} ha ABIERTO automáticamente`);
      } else if (horario.cierre === horaActual) {
        usuario.abierto = false;
        console.log(`[${horaActual}] Local ${usuario.nombreDelLocal} ha CERRADO automáticamente`);
      } else {
        continue;
      }

      await usuario.save();
    }
  } catch (error) {
    console.error('Error en la actualización automática de horarios:', error);
  }
}

function iniciarCronHorarios() {
  cron.schedule('* * * * *', ejecutarActualizacionHorarios);
  console.log('🕐 Cron de horarios iniciado (cada minuto)');
}

module.exports = { iniciarCronHorarios, ejecutarActualizacionHorarios };
