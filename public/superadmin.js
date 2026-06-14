let currentClient = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 2600);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.message || 'Error');
  return data;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function initials(value) {
  const words = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`;
  if (words.length === 1) return words[0].slice(0, 2);
  return 'AU';
}

async function copyText(text, label = 'Copiado') {
  await navigator.clipboard.writeText(text);
  toast(label);
}

function renderResult(client) {
  currentClient = client;
  const box = document.getElementById('resultBox');
  box.className = 'generated-client';
  box.innerHTML = `
    <div class="grid">
      <div class="col-6">
        <h3 style="margin-top:0;">Credenciales cliente</h3>
        <div class="secret-line"><span>URL</span><strong>https://${escapeHtml(client.subdomain)}</strong></div>
        <div class="secret-line"><span>Usuario admin</span><strong>${escapeHtml(client.adminUser)}</strong></div>
        <div class="secret-line"><span>Contraseña admin</span><strong>${escapeHtml(client.adminPassword)}</strong></div>
        <div class="secret-line"><span>PIN inicial</span><strong>${escapeHtml(client.initialPin)}</strong></div>
        <div class="inline-actions" style="margin-top:12px;">
          <button class="btn small" onclick="copyText(currentClient.welcomeMessage, 'Mensaje copiado')">Copiar mensaje cliente</button>
        </div>
      </div>
      <div class="col-6">
        <h3 style="margin-top:0;">Variables Coolify</h3>
        <pre class="code-block">${escapeHtml(client.envBlock)}</pre>
        <div class="inline-actions" style="margin-top:12px;">
          <button class="btn small secondary" onclick="copyText(currentClient.envBlock, 'Variables copiadas')">Copiar variables</button>
        </div>
      </div>
      <div class="col-12">
        <h3>Checklist deploy</h3>
        <ol class="checklist">
          <li>Duplicar la app/recurso en Coolify o crear nuevo recurso desde el repo.</li>
          <li>Asignar dominio <strong>https://${escapeHtml(client.subdomain)}</strong>.</li>
          <li>Crear A Record en Namecheap: <strong>${escapeHtml(client.subdomain.split('.')[0])}</strong> → IP del servidor.</li>
          <li>Pegar variables en Environment Variables.</li>
          <li>Deploy y prueba de login.</li>
          <li>Entregar mensaje al cliente.</li>
        </ol>
      </div>
    </div>
  `;
}

function clientCard(client) {
  return `
    <div class="item" style="align-items:flex-start;">
      <div class="item-main">
        <div class="item-title">${escapeHtml(client.name)} · ${escapeHtml(client.subdomain)}</div>
        <div class="item-meta">Usuario: ${escapeHtml(client.adminUser)} · PIN inicial: ${escapeHtml(client.initialPin)} · ${new Date(client.createdAt).toLocaleString('es-MX')}</div>
      </div>
      <div class="inline-actions end">
        <button class="btn small secondary" onclick='renderResult(${JSON.stringify(client).replaceAll("'", "&apos;")})'>Ver</button>
        <button class="btn small ghost" onclick="copyText(${JSON.stringify(client.welcomeMessage)}, 'Mensaje copiado')">Copiar mensaje</button>
        <button class="btn small danger" onclick="deleteClient('${client.id}')">Borrar</button>
      </div>
    </div>
  `;
}

async function loadClients() {
  const data = await api('/api/super/clients');
  const el = document.getElementById('clientsList');
  el.innerHTML = data.clients.length ? data.clients.map(clientCard).join('') : '<div class="item"><div>No hay clientes generados todavía.</div></div>';
}

async function deleteClient(id) {
  if (!confirm('¿Borrar este registro de cliente generado?')) return;
  await api(`/api/super/clients/${id}`, { method: 'DELETE' });
  await loadClients();
  toast('Registro borrado');
}

async function logoutSuper() {
  await api('/api/logout', { method: 'POST' });
  location.href = '/admin.html';
}

async function init() {
  try {
    const session = await api('/api/session');
    if (!session.isAdmin || session.role !== 'superadmin') {
      document.getElementById('accessDenied').style.display = 'block';
      return;
    }
    document.getElementById('superApp').style.display = 'block';
    await loadClients();
  } catch (error) {
    document.getElementById('accessDenied').style.display = 'block';
  }
}

document.getElementById('clientName').addEventListener('input', event => {
  const name = event.target.value;
  const slug = slugify(name);
  if (!document.getElementById('clientSlug').dataset.touched) document.getElementById('clientSlug').value = slug;
  if (!document.getElementById('pinPrefix').dataset.touched) document.getElementById('pinPrefix').value = initials(name);
  if (!document.getElementById('adminUser').dataset.touched) document.getElementById('adminUser').value = slug.replaceAll('-', '');
  if (!document.getElementById('subdomain').dataset.touched) document.getElementById('subdomain').value = `${slug}.kmo.lat`;
});

['clientSlug', 'pinPrefix', 'subdomain', 'adminUser'].forEach(id => {
  document.getElementById(id).addEventListener('input', event => {
    event.target.dataset.touched = 'true';
  });
});

document.getElementById('clientForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const payload = {
      name: document.getElementById('clientName').value,
      slug: document.getElementById('clientSlug').value,
      pinPrefix: document.getElementById('pinPrefix').value,
      subdomain: document.getElementById('subdomain').value,
      adminUser: document.getElementById('adminUser').value
    };
    const data = await api('/api/super/clients/generate', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    renderResult(data.client);
    await loadClients();
    toast('Cliente generado');
  } catch (error) {
    toast(error.message);
  }
});

init();
