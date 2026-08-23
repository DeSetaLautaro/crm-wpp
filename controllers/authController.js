const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Empresa = require('../models/Empresa');
const Usuario = require('../models/usuario');

const loginConPin = async (req, res) => {
  try {
    const { telefono, pin } = req.body || {};

    if (!telefono || typeof telefono !== 'string' || telefono.trim() === '') {
      return res.status(400).json({ error: 'El teléfono de WhatsApp es obligatorio' });
    }
    if (!pin || typeof pin !== 'string' || pin.trim() === '') {
      return res.status(400).json({ error: 'El PIN es obligatorio' });
    }

    // 1. Buscar el Usuario por su número de WhatsApp (teléfono)
    const usuario = await Usuario.findOne({ telefono: telefono.trim() });
    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // 2. Verificar el PIN hasheado del usuario
    const pinValido = await bcrypt.compare(pin.trim(), usuario.pinCrm);
    if (!pinValido) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // 3. Buscar TODAS las empresas (líneas de WhatsApp) del usuario
    const empresas = await Empresa.find({ usuarioAppId: usuario._id }).lean();
    const empresasIds = empresas.map(e => e._id.toString());
    if (empresasIds.length === 0) {
      return res.status(404).json({ error: 'El usuario no tiene líneas de WhatsApp asociadas' });
    }

    // 4. Generar token con los datos necesarios
    const token = jwt.sign(
      {
        userId: usuario._id.toString(),
        empresaId: empresasIds[0],
        empresas: empresasIds,
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
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno al iniciar sesión' });
  }
};

module.exports = { loginConPin };
