const jwt = require('jsonwebtoken');
const Empresa = require('../models/Empresa');
const Usuario = require('../models/usuario');

const loginConPin = async (req, res) => {
  try {
    const { pin } = req.body || {};

    if (!pin || typeof pin !== 'string' || pin.trim() === '') {
      return res.status(400).json({ error: 'El PIN es obligatorio' });
    }

    // 1. Buscar la empresa que tenga ese PIN
    const empresa = await Empresa.findOne({
      $or: [{ pinCrm: pin.trim() }, { pin: pin.trim() }]
    });

    if (!empresa) {
      return res.status(401).json({ error: 'PIN inválido' });
    }

    // 2. Con el id de la empresa, buscar al usuario dueño
    const usuario = await Usuario.findById(empresa.usuarioAppId).lean();
    if (!usuario) {
      return res.status(404).json({ error: 'No se encontró el usuario asociado a esta empresa' });
    }

    // 3. Generar token con los datos necesarios
    const token = jwt.sign(
      {
        userId: usuario._id.toString(),
        empresaId: empresa._id.toString(),
        email: usuario.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      ok: true,
      token,
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        nombreDelLocal: usuario.nombreDelLocal,
        rubro: usuario.rubro || ''
      }
    });
  } catch (error) {
    console.error('Error en login con PIN:', error);
    return res.status(500).json({ error: 'Error interno al iniciar sesión' });
  }
};

module.exports = { loginConPin };
