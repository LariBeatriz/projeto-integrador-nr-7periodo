// Cliente da API do EcoAR.
const Api = (() => {
  const CHAVE_TOKEN = 'ecoar.token';
  const CHAVE_ADMIN = 'ecoar.admin';

  function ler(chave) {
    try { return localStorage.getItem(chave); } catch { return null; }
  }
  function gravar(chave, valor) {
    try { valor ? localStorage.setItem(chave, valor) : localStorage.removeItem(chave); } catch { /* sem storage */ }
  }

  async function req(metodo, url, corpo, { admin = false } = {}) {
    const token = ler(admin ? CHAVE_ADMIN : CHAVE_TOKEN);
    let resp;
    try {
      resp = await fetch(url, {
        method: metodo,
        headers: {
          ...(corpo ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      const e = new Error('Sem conexão com o servidor. Verifique sua internet.');
      e.status = 0;
      throw e;
    }
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const e = new Error(dados.erro || `Erro ${resp.status}`);
      e.status = resp.status;
      e.dados = dados;
      if (resp.status === 401 && !admin) gravar(CHAVE_TOKEN, null);
      throw e;
    }
    return dados;
  }

  return {
    get token() { return ler(CHAVE_TOKEN); },
    get tokenAdmin() { return ler(CHAVE_ADMIN); },
    sair() { gravar(CHAVE_TOKEN, null); },
    sairAdmin() { gravar(CHAVE_ADMIN, null); },

    async cadastrar(nome, senha) {
      const r = await req('POST', '/api/usuarios', { nome, senha });
      gravar(CHAVE_TOKEN, r.token);
      return r.usuario;
    },
    async entrar(nome, senha) {
      const r = await req('POST', '/api/sessoes', { nome, senha });
      gravar(CHAVE_TOKEN, r.token);
      return r.usuario;
    },
    eu: () => req('GET', '/api/eu'),
    catalogo: () => req('GET', '/api/catalogo'),
    iniciarPartida: (duracao, modo) => req('POST', '/api/partidas', { duracao, modo }),
    descartar: (id, dados) => req('POST', `/api/partidas/${id}/descartes`, dados),
    finalizar: (id, motivo) => req('POST', `/api/partidas/${id}/finalizar`, { motivo }),
    historico: () => req('GET', '/api/partidas'),
    partida: (id) => req('GET', `/api/partidas/${id}`),
    estatisticas: () => req('GET', '/api/estatisticas'),

    async entrarAdmin(senha) {
      const r = await req('POST', '/api/admin/login', { senha });
      gravar(CHAVE_ADMIN, r.token);
    },
    resumoAdmin: () => req('GET', '/api/admin/resumo', null, { admin: true }),
    ativarUsuario: (id, ativo) => req('PATCH', `/api/admin/usuarios/${id}`, { ativo }, { admin: true }),
  };
})();
