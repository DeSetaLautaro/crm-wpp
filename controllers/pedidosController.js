const Pedido = require('../models/Pedido');

// Crear pedido confirmado (usada internamente cuando el bot confirma)
async function guardarPedidoConfirmado(datos) {
  const pedido = new Pedido({
    ...datos,
    estado: datos.estado || 'confirmado'
  });
  await pedido.save();
  return pedido;
}

// Endpoint POST /api/pedidos (cumple el flujo de confirmación)
async function confirmarPedido(req, res) {
  try {
    const localId = req.usuario.id || req.userId;
    if (!localId) {
      return res.status(400).json({ error: 'No se pudo identificar el local' });
    }
    const {
      cliente = '',
      telefonoCliente = '',
      items = [],
      total = 0,
      metodoPago = '',
      direccion = '',
      notas = '',
      fechaTurno = '',
      fecha = new Date()
    } = req.body || {};

    const pedido = await guardarPedidoConfirmado({
      localId,
      cliente,
      telefonoCliente,
      items,
      total,
      metodoPago,
      estado: 'confirmado',
      direccion,
      notas,
      fechaTurno,
      fecha
    });

    return res.status(201).json({ ok: true, pedido });
  } catch (error) {
    console.error('Error al confirmar pedido:', error);
    return res.status(500).json({ error: 'Error interno al confirmar pedido' });
  }
}

// Endpoint GET /api/pedidos/cliente/:telefono
async function obtenerPedidosPorTelefono(req, res) {
  try {
    const { telefono } = req.params;
    const localId = req.usuario.id || req.userId;
    if (!localId) {
      return res.status(400).json({ error: 'No se pudo identificar el local' });
    }

    const pedidos = await Pedido.find({
      localId,
      telefonoCliente: telefono
    }).sort({ fecha: -1 }).lean();

    return res.json({ ok: true, pedidos });
  } catch (error) {
    console.error('Error al obtener pedidos por telefono:', error);
    return res.status(500).json({ error: 'Error interno al obtener pedidos' });
  }
}

module.exports = {
  guardarPedidoConfirmado,
  confirmarPedido,
  obtenerPedidosPorTelefono
};
