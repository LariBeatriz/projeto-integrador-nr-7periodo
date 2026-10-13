// Telas do EcoAR (seção 10 — requisitos de interface) com roteamento por hash.
(() => {
  const app = document.getElementById('app');
  let usuario = null;
  let catalogo = null;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataHora = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const pct = (x) => `${Math.round((x || 0) * 100)}%`;
  const MEDALHAS = { ouro: ['🥇', 'Ouro'], prata: ['🥈', 'Prata'], bronze: ['🥉', 'Bronze'] };
  const STATUS = { concluida: 'Concluída', interrompida: 'Interrompida', expirada: 'Expirada', em_andamento: 'Em andamento' };
  const BONUS = { sequencia: '🔥 Sequência', precisao: '🎯 Precisão', eficiencia: '⚡ Eficiência' };

  function ir(rota) {
    if (location.hash === `#${rota}`) render();
    else location.hash = rota;
  }

  function topo() {
    return `<div class="topo"><h1>♻️ EcoAR</h1>${usuario
      ? `<div class="usuario">👤 ${esc(usuario.nome)} <button class="btn sec peq" id="btn-logout" style="color:#fff">Sair</button></div>`
      : ''}</div>`;
  }

  function tela(html) {
    app.innerHTML = topo() + `<main class="tela">${html}</main>`;
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      Api.sair();
      usuario = null;
      ir('/');
    });
    window.scrollTo(0, 0);
  }

  function voltar(rota = '/menu', texto = '← Menu') {
    return `<p><a href="#${rota}">${texto}</a></p>`;
  }

  function erroTela(e) {
    tela(`<div class="cartao"><h2>⚠ Algo deu errado</h2><p>${esc(e.message)}</p>
      <div class="linha-btn"><button class="btn" id="tentar">Tentar novamente</button><a class="btn sec" href="#/menu">Menu</a></div></div>`);
    document.getElementById('tentar').onclick = render;
  }

  // ---------- Tela inicial: identificação/cadastro (RF01/RF02) ----------
  function telaLogin() {
    let modo = 'entrar';
    tela(`
      <div class="logo">♻️🕶️</div>
      <h2 class="titulo">EcoAR</h2>
      <p class="subtitulo">Aprenda a separar o lixo jogando com realidade aumentada.</p>
      <div class="cartao">
        <div class="abas">
          <button class="btn sec ativo" data-modo="entrar" type="button">Entrar</button>
          <button class="btn sec" data-modo="cadastrar" type="button">Criar cadastro</button>
        </div>
        <form id="form-login" novalidate>
          <div class="campo"><label for="nome">Nome ou apelido</label>
            <input id="nome" autocomplete="username" required minlength="3" maxlength="30" /></div>
          <div class="campo"><label for="senha">Senha</label>
            <input id="senha" type="password" autocomplete="current-password" required minlength="4" /></div>
          <button class="btn grande" id="btn-enviar">Entrar</button>
          <p class="erro-msg" id="erro" role="alert"></p>
        </form>
        <p class="muted">Guardamos apenas seu apelido, sua senha protegida e os resultados das partidas. As imagens da câmera são processadas no seu aparelho e nunca são enviadas.</p>
      </div>
      <p class="muted" style="text-align:center"><a href="#/admin">Área do administrador/pesquisador</a></p>`);

    const botoes = app.querySelectorAll('[data-modo]');
    botoes.forEach((b) => b.addEventListener('click', () => {
      modo = b.dataset.modo;
      botoes.forEach((x) => x.classList.toggle('ativo', x === b));
      document.getElementById('btn-enviar').textContent = modo === 'entrar' ? 'Entrar' : 'Criar cadastro';
      document.getElementById('senha').autocomplete = modo === 'entrar' ? 'current-password' : 'new-password';
    }));

    document.getElementById('form-login').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const nome = document.getElementById('nome').value.trim();
      const senha = document.getElementById('senha').value;
      const btn = document.getElementById('btn-enviar');
      const erro = document.getElementById('erro');
      erro.textContent = '';
      btn.disabled = true;
      try {
        usuario = modo === 'entrar' ? await Api.entrar(nome, senha) : await Api.cadastrar(nome, senha);
        ir('/menu');
      } catch (e) {
        erro.textContent = e.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---------- Menu ----------
  function telaMenu() {
    tela(`
      <h2>Olá, ${esc(usuario.nome)}! 🌱</h2>
      <p class="muted">Colete os resíduos e descarte cada um na lixeira certa antes que o tempo acabe.</p>
      <div class="menu">
        <a class="btn" href="#/instrucoes"><span>🎮</span>Jogar</a>
        <a class="btn sec" href="#/historico"><span>📜</span>Histórico</a>
        <a class="btn sec" href="#/estatisticas"><span>📊</span>Estatísticas</a>
      </div>`);
  }

  // ---------- Instruções (UC01 passo 4) ----------
  async function telaInstrucoes() {
    catalogo = catalogo || (await Api.catalogo());
    const r = catalogo.regras;
    const temCamera = !!navigator.mediaDevices?.getUserMedia;
    tela(`${voltar()}
      <div class="cartao">
        <h2>📋 Como jogar</h2>
        <ol>
          <li><strong>Colete</strong>: toque em um resíduo virtual flutuando na tela <em>ou</em> aponte a câmera para um objeto real (garrafa, copo, fruta, caderno, talher…) e toque no quadro amarelo.</li>
          <li><strong>Descarte</strong>: toque na lixeira correta (ou use as teclas 1 a 5).</li>
          <li>Descubra se acertou e aprenda com as explicações!</li>
        </ol>
        <h3>Lixeiras (padrão de cores da coleta seletiva)</h3>
        <div class="lista-lixeiras">${catalogo.lixeiras.map((l) =>
          `<div class="chip-lixeira" style="background:${l.cor}">${l.icone} <span class="simbolo">${esc(l.simbolo)}</span> ${esc(l.nome)}</div>`).join('')}</div>
        <h3>Pontuação</h3>
        <ul>
          <li>✓ Descarte correto: <strong>+${r.pontosAcerto}</strong></li>
          <li>✗ Descarte incorreto: <strong>${r.pontosErro}</strong> (com explicação)</li>
          <li>🔥 Sequência: <strong>+${r.sequencia.pontos}</strong> a cada ${r.sequencia.tamanho} acertos seguidos</li>
          <li>🎯 Precisão: <strong>+${r.precisao.pontos}</strong> com ${r.precisao.taxaMinima * 100}% ou mais de acertos (mínimo ${r.precisao.minimoDescartes} descartes)</li>
          <li>⚡ Eficiência: <strong>+${r.eficiencia.pontos}</strong> ao atingir ${r.eficiencia.pontosPorSegundo} pontos por segundo de partida (ex.: ${r.eficiencia.pontosPorSegundo * 60} pts em 60 s)</li>
        </ul>
        <p class="muted">A pontuação final nunca fica abaixo de zero.</p>
      </div>
      <div class="cartao">
        <h2>⚙️ Configurar partida</h2>
        <div class="campo"><label>Tempo limite</label>
          <div class="opcoes">${r.duracoes.map((d) =>
            `<label><input type="radio" name="duracao" value="${d}" ${d === r.duracaoPadrao ? 'checked' : ''}><span>${d} s</span></label>`).join('')}</div>
        </div>
        <div class="campo"><label>Modo</label>
          <div class="opcoes">
            <label><input type="radio" name="modo" value="camera" ${temCamera ? 'checked' : 'disabled'}><span>📷 Câmera + RA (reconhece objetos reais)</span></label>
            <label><input type="radio" name="modo" value="virtual" ${temCamera ? '' : 'checked'}><span>🖥️ Ambiente virtual (sem câmera)</span></label>
          </div>
        </div>
        <p class="aviso">⚠️ <strong>Segurança:</strong> jogue em uma área livre de obstáculos, olhe por onde anda e não se distraia com a tela ao se movimentar.</p>
        <p class="erro-msg" id="erro" role="alert"></p>
        <button class="btn grande" id="btn-iniciar">▶ Iniciar partida</button>
      </div>`);

    if (temCamera) Visao.carregarModelo().catch(() => {}); // pré-carrega o modelo (RNF01)

    document.getElementById('btn-iniciar').addEventListener('click', async (ev) => {
      const duracao = Number(app.querySelector('input[name=duracao]:checked').value);
      const modo = app.querySelector('input[name=modo]:checked').value;
      ev.target.disabled = true;
      try {
        const partida = await Api.iniciarPartida(duracao, modo);
        Jogo.iniciar({
          catalogo, partida, modo,
          aoTerminar: (resultado, erro) => {
            if (resultado) {
              sessionStorage.setItem('ecoar.ultimo', JSON.stringify(resultado));
              ir(`/resultado/${resultado.id_partida}`);
            } else {
              erroTela(new Error(`Não foi possível registrar o fim da partida (${erro?.message}). O resultado será recuperado no histórico.`));
            }
          },
        });
      } catch (e) {
        document.getElementById('erro').textContent = e.message;
        ev.target.disabled = false;
      }
    });
  }

  // ---------- Resultado (RF14) e detalhe de partida (UC04) ----------
  function htmlResultado(p, titulo) {
    const [emoji, nome] = MEDALHAS[p.medalha] || ['🌱', 'Continue praticando'];
    return `
      <div class="cartao" style="text-align:center">
        <h2>${titulo}</h2>
        <div class="medalha" aria-hidden="true">${emoji}</div>
        <p><strong>${nome}</strong></p>
        <div class="kpis">
          <div class="kpi"><strong>${p.pontuacao_final}</strong><small>pontuação final</small></div>
          <div class="kpi"><strong>✓ ${p.total_acertos}</strong><small>acertos</small></div>
          <div class="kpi"><strong>✗ ${p.total_erros}</strong><small>erros</small></div>
          <div class="kpi"><strong>${pct(p.taxa_acerto)}</strong><small>precisão</small></div>
          <div class="kpi"><strong>+${p.bonus_total}</strong><small>bônus</small></div>
        </div>
        <p class="muted">${dataHora(p.data_inicio)} · ${p.duracao_segundos ?? '—'} s de ${p.duracao_limite} s · ${STATUS[p.status] || p.status}</p>
      </div>
      <div class="cartao">
        <h2>Composição da pontuação</h2>
        <table>
          <tr><td>Pontos dos descartes (acertos − penalidades)</td><td style="text-align:right">${p.pontos_base}</td></tr>
          ${p.bonus.map((b) => `<tr><td>${BONUS[b.tipo] || b.tipo} — <span class="muted">${esc(b.descricao)}</span></td><td style="text-align:right">+${b.pontos}</td></tr>`).join('')
            || '<tr><td class="muted">Nenhuma bonificação nesta partida</td><td></td></tr>'}
          <tr><th>Total${p.pontos_base + p.bonus_total < 0 ? ' (mínimo zero)' : ''}</th><th style="text-align:right">${p.pontuacao_final}</th></tr>
        </table>
      </div>
      <div class="cartao">
        <h2>Descartes (${p.eventos.length})</h2>
        ${p.eventos.length ? `<div class="tabela-scroll"><table>
          <tr><th>Resíduo</th><th>Lixeira escolhida</th><th>Resultado</th><th>Pontos</th></tr>
          ${p.eventos.map((e) => `<tr>
            <td>${e.icone} ${esc(e.residuo)}</td><td>${esc(e.lixeira_escolhida)}</td>
            <td>${e.descarte_correto ? '<span class="badge ok">✓ correto</span>' : `<span class="badge erro">✗ era ${esc(e.lixeira_correta)}</span>`}</td>
            <td>${e.pontos_evento > 0 ? '+' : ''}${e.pontos_evento}</td></tr>`).join('')}
        </table></div>` : '<p class="muted">Nenhum descarte realizado.</p>'}
      </div>`;
  }

  async function telaResultado(id) {
    let p = null;
    try { p = JSON.parse(sessionStorage.getItem('ecoar.ultimo')); } catch { /* ignora */ }
    if (!p || p.id_partida !== id) p = await Api.partida(id);
    tela(htmlResultado(p, '🏁 Fim de partida!') + `
      <div class="linha-btn"><a class="btn" href="#/instrucoes">🔁 Jogar novamente</a>
      <a class="btn sec" href="#/historico">📜 Histórico</a><a class="btn sec" href="#/menu">Menu</a></div>`);
  }

  async function telaDetalhe(id) {
    const p = await Api.partida(id);
    tela(voltar('/historico', '← Histórico') + htmlResultado(p, 'Detalhes da partida'));
  }

  // ---------- Histórico (RF16) ----------
  async function telaHistorico() {
    const lista = await Api.historico();
    tela(`${voltar()}
      <div class="cartao"><h2>📜 Minhas partidas</h2>
      ${lista.length ? `<div class="tabela-scroll"><table>
        <tr><th>Data</th><th>Pontos</th><th>✓</th><th>✗</th><th>Bônus</th><th>Medalha</th><th>Situação</th></tr>
        ${lista.map((p) => `<tr class="clicavel" data-id="${p.id_partida}" tabindex="0">
          <td>${dataHora(p.data_inicio)}</td><td><strong>${p.pontuacao_final}</strong></td>
          <td>${p.total_acertos}</td><td>${p.total_erros}</td><td>+${p.bonus_total}</td>
          <td>${MEDALHAS[p.medalha]?.[0] || '—'}</td><td>${STATUS[p.status] || p.status}</td></tr>`).join('')}
      </table></div><p class="muted">Toque em uma partida para ver os detalhes.</p>`
        : '<p>Você ainda não jogou nenhuma partida. <a href="#/instrucoes">Jogar agora</a></p>'}
      </div>`);
    app.querySelectorAll('tr[data-id]').forEach((tr) => {
      const abrir = () => ir(`/partida/${tr.dataset.id}`);
      tr.addEventListener('click', abrir);
      tr.addEventListener('keydown', (e) => e.key === 'Enter' && abrir());
    });
  }

  // ---------- Estatísticas (RF17) ----------
  function grafico(pontos) {
    if (pontos.length < 2) return '<p class="muted">Jogue pelo menos duas partidas para ver sua evolução.</p>';
    const max = Math.max(...pontos, 1);
    const W = 600, H = 150, P = 20;
    const xy = pontos.map((v, i) => [P + (i * (W - 2 * P)) / (pontos.length - 1), H - P - (v / max) * (H - 2 * P)]);
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pontuação das últimas ${pontos.length} partidas">
      <line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="currentColor" opacity=".2"/>
      <polyline fill="none" stroke="#3fbf7f" stroke-width="3" points="${xy.map((p) => p.join(',')).join(' ')}"/>
      ${xy.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4" fill="#3fbf7f"><title>${pontos[i]} pts</title></circle>`).join('')}
      <text x="${P}" y="12" font-size="11" fill="currentColor" opacity=".6">máx. ${max}</text></svg>`;
  }

  async function telaEstatisticas() {
    const e = await Api.estatisticas();
    const g = e.geral;
    const total = g.acertos + g.erros;
    tela(`${voltar()}
      <div class="cartao"><h2>📊 Meu desempenho</h2>
        <div class="kpis">
          <div class="kpi"><strong>${g.partidas}</strong><small>partidas</small></div>
          <div class="kpi"><strong>${g.total_pontos}</strong><small>pontos totais</small></div>
          <div class="kpi"><strong>${g.melhor_pontuacao}</strong><small>melhor partida</small></div>
          <div class="kpi"><strong>✓ ${g.acertos}</strong><small>acertos</small></div>
          <div class="kpi"><strong>✗ ${g.erros}</strong><small>erros</small></div>
          <div class="kpi"><strong>${total ? pct(g.acertos / total) : '—'}</strong><small>precisão geral</small></div>
        </div>
        <p style="text-align:center">🥇 ${g.ouro} · 🥈 ${g.prata} · 🥉 ${g.bronze} · bônus acumulado: +${g.bonus}</p>
      </div>
      <div class="cartao grafico"><h2>📈 Evolução (últimas partidas)</h2>${grafico(e.evolucao.map((p) => p.pontuacao_final))}</div>
      <div class="cartao"><h2>Precisão por tipo de lixeira</h2>
        ${e.por_categoria.length ? e.por_categoria.map((c) => {
          const t = c.acertos + c.erros;
          return `<p style="margin:10px 0 4px"><span class="simbolo" style="background:${c.cor};color:#fff">${esc(c.simbolo)}</span>
            <strong>${esc(c.categoria)}</strong> — ${pct(c.acertos / t)} (${c.acertos}/${t})</p>
            <div class="barra"><div style="width:${(c.acertos / t) * 100}%"></div></div>`;
        }).join('') : '<p class="muted">Sem descartes registrados.</p>'}
      </div>
      ${e.mais_errados.length ? `<div class="cartao"><h2>📚 Para revisar</h2><p class="muted">Resíduos que você mais errou:</p>
        <ul>${e.mais_errados.map((r) => `<li>${r.icone} ${esc(r.nome)} — ${r.erros} erro(s)</li>`).join('')}</ul></div>` : ''}`);
  }

  // ---------- Administração / pesquisa (perfil da seção 3.3) ----------
  async function telaAdmin() {
    if (!Api.tokenAdmin) {
      tela(`${voltar(usuario ? '/menu' : '/', '← Voltar')}
        <div class="cartao"><h2>🔒 Administrador / pesquisador</h2>
          <form id="form-admin"><div class="campo"><label for="senha-admin">Senha administrativa</label>
          <input id="senha-admin" type="password" autocomplete="current-password" required /></div>
          <button class="btn">Entrar</button><p class="erro-msg" id="erro" role="alert"></p></form></div>`);
      document.getElementById('form-admin').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          await Api.entrarAdmin(document.getElementById('senha-admin').value);
          render();
        } catch (e) {
          document.getElementById('erro').textContent = e.message;
        }
      });
      return;
    }

    let d;
    try {
      d = await Api.resumoAdmin();
    } catch (e) {
      if (e.status === 403) { Api.sairAdmin(); return render(); }
      throw e;
    }
    const g = d.geral;
    tela(`<div class="linha-btn" style="justify-content:space-between">${voltar(usuario ? '/menu' : '/', '← Voltar')}
        <button class="btn sec peq" id="sair-admin">Sair da administração</button></div>
      <div class="cartao"><h2>🧪 Painel do pesquisador</h2>
        <div class="kpis">
          <div class="kpi"><strong>${g.usuarios}</strong><small>usuários</small></div>
          <div class="kpi"><strong>${g.partidas}</strong><small>partidas</small></div>
          <div class="kpi"><strong>${g.media_pontos}</strong><small>média de pontos</small></div>
          <div class="kpi"><strong>${g.acertos + g.erros ? pct(g.acertos / (g.acertos + g.erros)) : '—'}</strong><small>precisão geral</small></div>
        </div></div>
      <div class="cartao"><h2>Taxa de erro por resíduo</h2><div class="tabela-scroll"><table>
        <tr><th>Resíduo</th><th>Lixeira correta</th><th>Tentativas</th><th>Erros</th><th>% erro</th></tr>
        ${d.residuos.map((r) => `<tr><td>${r.icone} ${esc(r.nome)}</td><td>${esc(r.lixeira_correta)}</td><td>${r.tentativas}</td><td>${r.erros}</td>
          <td>${r.tentativas ? pct(r.erros / r.tentativas) : '—'}</td></tr>`).join('')}
      </table></div></div>
      <div class="cartao"><h2>Partidas recentes</h2><div class="tabela-scroll"><table>
        <tr><th>Jogador</th><th>Data</th><th>Pontos</th><th>✓</th><th>✗</th><th>Bônus</th><th>Modo</th><th>Situação</th></tr>
        ${d.partidas.map((p) => `<tr><td>${esc(p.nome_exibicao)}</td><td>${dataHora(p.data_inicio)}</td><td>${p.pontuacao_final}</td>
          <td>${p.total_acertos}</td><td>${p.total_erros}</td><td>+${p.bonus_total}</td><td>${p.modo}</td><td>${STATUS[p.status] || p.status}</td></tr>`).join('')}
      </table></div></div>
      <div class="cartao"><h2>Usuários</h2><div class="tabela-scroll"><table>
        <tr><th>Nome</th><th>Cadastro</th><th>Partidas</th><th>Melhor</th><th>Situação</th></tr>
        ${d.usuarios.map((u) => `<tr><td>${esc(u.nome_exibicao)}</td><td>${dataHora(u.data_cadastro)}</td><td>${u.partidas}</td><td>${u.melhor}</td>
          <td><button class="btn sec peq" data-usuario="${u.id_usuario}" data-ativo="${u.ativo}">${u.ativo ? '✓ Ativo — desativar' : '✗ Inativo — ativar'}</button></td></tr>`).join('')}
      </table></div></div>`);
    document.getElementById('sair-admin').onclick = () => { Api.sairAdmin(); render(); };
    app.querySelectorAll('[data-usuario]').forEach((b) => b.addEventListener('click', async () => {
      await Api.ativarUsuario(b.dataset.usuario, b.dataset.ativo !== 'true');
      render();
    }));
  }

  // ---------- Roteador ----------
  async function render() {
    if (Jogo.ativo) return;
    const rota = location.hash.slice(1) || '/';
    try {
      if (rota === '/admin') return await telaAdmin();
      if (!usuario && Api.token) {
        try { usuario = await Api.eu(); } catch { usuario = null; }
      }
      if (!usuario) return telaLogin();
      const [, pagina, id] = rota.split('/');
      switch (pagina) {
        case 'instrucoes': return await telaInstrucoes();
        case 'resultado': return await telaResultado(id);
        case 'partida': return await telaDetalhe(id);
        case 'historico': return await telaHistorico();
        case 'estatisticas': return await telaEstatisticas();
        default: return telaMenu();
      }
    } catch (e) {
      erroTela(e);
    }
  }

  window.addEventListener('hashchange', render);
  render();
})();
