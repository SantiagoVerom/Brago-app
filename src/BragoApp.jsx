const { put, list } = require('@vercel/blob');

const BLOB_KEY = 'data/brago-clientes.json';

async function getClientes() {
  const { blobs } = await list({ prefix: 'data/brago-clientes' });
  if (!blobs || blobs.length === 0) return [];
  const latest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
  const response = await fetch(latest.url);
  return await response.json();
}

async function saveClientes(clientes) {
  await put(BLOB_KEY, JSON.stringify(clientes), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET /api/clientes — lista todos
    // GET /api/clientes?gmail=x — busca por gmail
    if (req.method === 'GET') {
      const clientes = await getClientes();
      const { gmail } = req.query;
      if (gmail) {
        const found = clientes.find(c => c.gmail && c.gmail.toLowerCase() === gmail.toLowerCase());
        return res.status(200).json(found || null);
      }
      return res.status(200).json(clientes);
    }

    // POST /api/clientes — crear o actualizar cliente
    // Body: { gmail, nombre, celular, fechaNacimiento, compras? }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);

      const { gmail, nombre, celular, fechaNacimiento } = body;
      if (!gmail) return res.status(400).json({ error: 'gmail requerido' });

      const clientes = await getClientes();
      const idx = clientes.findIndex(c => c.gmail && c.gmail.toLowerCase() === gmail.toLowerCase());

      if (idx >= 0) {
        // Ya existe — actualizar datos pero mantener compras y fidelidad
        clientes[idx] = {
          ...clientes[idx],
          nombre: nombre || clientes[idx].nombre,
          celular: celular || clientes[idx].celular,
          fechaNacimiento: fechaNacimiento || clientes[idx].fechaNacimiento,
          updatedAt: new Date().toISOString(),
        };
        await saveClientes(clientes);
        return res.status(200).json({ ok: true, cliente: clientes[idx], action: 'updated' });
      } else {
        // Nuevo cliente
        const nuevo = {
          id: Date.now().toString(),
          gmail,
          nombre: nombre || '',
          celular: celular || '',
          fechaNacimiento: fechaNacimiento || '',
          compras: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        clientes.push(nuevo);
        await saveClientes(clientes);
        return res.status(201).json({ ok: true, cliente: nuevo, action: 'created' });
      }
    }

    // PUT /api/clientes — agregar compra a un cliente existente
    // Body: { gmail, compra: { fecha, items, total, descuento } }
    if (req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);

      const { gmail, compra } = body;
      if (!gmail || !compra) return res.status(400).json({ error: 'gmail y compra requeridos' });

      const clientes = await getClientes();
      const idx = clientes.findIndex(c => c.gmail && c.gmail.toLowerCase() === gmail.toLowerCase());
      if (idx < 0) return res.status(404).json({ error: 'cliente no encontrado' });

      clientes[idx].compras = [...(clientes[idx].compras || []), compra];
      clientes[idx].updatedAt = new Date().toISOString();
      await saveClientes(clientes);

      return res.status(200).json({ ok: true, cliente: clientes[idx] });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
