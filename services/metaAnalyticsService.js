const Empresa = require('../models/Empresa');

async function obtenerWabaId(empresa) {
  // Si ya lo tenemos guardado, lo usamos
  if (empresa.wabaId) return empresa.wabaId;

  // Sino, lo obtenemos del phone_number_id
  const token = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = empresa.whatsappPhoneId;
  if (!token || !phoneId) return null;

  const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneId}?fields=whatsapp_business_account`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json();
  const wabaId = data.whatsapp_business_account?.id;

  if (wabaId) {
    await Empresa.findByIdAndUpdate(empresa._id, { $set: { wabaId } });
  }
  return wabaId || null;
}

async function actualizarCostosEmpresa(empresa) {
  const wabaId = await obtenerWabaId(empresa);
  if (!wabaId) return null;

  const token = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
  // Últimos 30 días para tener un panorama
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const end = new Date().toISOString().split('T')[0];

  const url = `https://graph.facebook.com/v19.0/${wabaId}/analytics?start=${start}&end=${end}&granularity=DAY&metric_types=CONVERSATION&conversation_types=BUSINESS_INITIATED,USER_INITIATED`;

  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!resp.ok) return null;

  const data = await resp.json();
  const costoTotal = data?.data?.reduce((acc, d) => {
    return acc + (d.conversation_costs?.reduce((s, c) => s + (parseFloat(c.cost) || 0), 0) || 0);
  }, 0) || 0;

  await Empresa.findByIdAndUpdate(empresa._id, {
    $set: {
      metaCostoTotal: costoTotal.toFixed(4),
      metaUltimaActualizacion: new Date()
    }
  });

  return costoTotal;
}

async function actualizarCostosDeTodasLasEmpresas() {
  const empresas = await Empresa.find({});
  for (const empresa of empresas) {
    try {
      await actualizarCostosEmpresa(empresa);
    } catch (e) {
      console.error(`Error con empresa ${empresa.nombre}:`, e.message);
    }
  }
}

module.exports = { actualizarCostosEmpresa, actualizarCostosDeTodasLasEmpresas };
