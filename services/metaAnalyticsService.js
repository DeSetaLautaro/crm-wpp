const Empresa = require('../models/Empresa');

async function obtenerWabaId(empresa) {
  // Si ya lo tenemos guardado, lo usamos
  if (empresa.wabaId) {
    console.log(`✅ WABA ID ya estaba guardado: ${empresa.wabaId}`);
    return empresa.wabaId;
  }

  // Si hay un WABA global en .env, lo usamos y lo guardamos en la empresa
  if (process.env.WHATSAPP_WABA_ID) {
    console.log(`🌐 Usando WABA ID desde .env: ${process.env.WHATSAPP_WABA_ID}`);
    await Empresa.findByIdAndUpdate(empresa._id, {
      $set: { wabaId: process.env.WHATSAPP_WABA_ID }
    });
    return process.env.WHATSAPP_WABA_ID;
  }

  // Sino, intentamos obtenerlo del phone_number_id
  const token = empresa.tokenMeta || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = empresa.whatsappPhoneId;
  console.log('🔍 Buscando WABA ID con:', { token: token ? 'OK' : 'FALTA', phoneId });
  if (!token || !phoneId) {
    console.error('❌ No hay token o phoneId para obtener WABA ID');
    return null;
  }

  const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneId}?fields=whatsapp_business_account`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json();
  console.log('📥 Respuesta al obtener WABA:', JSON.stringify(data));
  const wabaId = data.whatsapp_business_account?.id;

  if (!wabaId) {
    console.error('❌ WhatsApp Business Account no vino en la respuesta');
  }

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

  console.log(`🌐 Llamando a Meta analytics con URL: ${url}`);
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!resp.ok) {
    const cuerpo = await resp.text();
    console.error(`⚠️ Error obteniendo analytics de Meta: ${resp.status} ${cuerpo}`);
    return null;
  }

  const data = await resp.json();
  console.log('📥 Respuesta cruda de Meta analytics:', JSON.stringify(data).slice(0, 1000));

  if (!data || !Array.isArray(data.data)) {
    console.warn('⚠️ Analytics de Meta sin el formato esperado. Respuesta cruda:', JSON.stringify(data));
    return null;
  }

  const costoTotal = data.data.reduce((acc, d) => {
    return acc + (d.conversation_costs?.reduce((s, c) => s + (parseFloat(c.cost) || 0), 0) || 0);
  }, 0) || 0;

  await Empresa.findByIdAndUpdate(empresa._id, {
    $set: {
      metaCostoTotal: costoTotal.toFixed(4),
      metaUltimaActualizacion: new Date()
    }
  });

  console.log(`✅ Analytics Meta actualizadas para empresa ${empresa.nombre}: costoTotal=${costoTotal} usd`);

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
