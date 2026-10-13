// Interface da partida: elementos de RA sobre a câmera, cronômetro, coleta e descarte.
// A validação e a pontuação são feitas pelo servidor; o cliente apenas exibe o estado.
const Jogo = (() => {
  const $ = (id) => document.getElementById(id);
  let s = null; // estado da partida atual

  function iniciar({ catalogo, partida, modo, aoTerminar }) {
    const camera = modo === 'camera';
    s = {
      catalogo, partida, aoTerminar,
      fim: performance.now() + partida.duracao_limite * 1000,
      proximoItem: 0,
      noCampo: new Map(), // instancia → elemento
      mao: null,
      contadorReal: 0,
      enviando: null,
      encerrando: false,
      timer: null,
      feedbackTimer: null,
      maxNoCampo: camera ? 3 : 4,
    };

    $('app').hidden = true;
    $('jogo').hidden = false;
    $('campo').innerHTML = '';
    $('feedback').hidden = true;
    $('fundo-virtual').hidden = camera;
    $('video').hidden = !camera;
    atualizarHud({ pontuacao: 0, acertos: 0, erros: 0, sequencia: 0 });
    montarLixeiras();
    atualizarMao();

    $('campo').onclick = cliqueNoCampo;
    $('btn-sair').onclick = () => {
      if (confirm('Encerrar a partida agora? O resultado parcial será registrado.')) encerrar('abandono');
    };
    document.addEventListener('keydown', teclado);

    for (let i = 0; i < s.maxNoCampo; i++) gerarItem();
    s.timer = setInterval(tick, 200);
    tick();

    if (camera) ligarCamera();
    else status('Modo virtual: os resíduos aparecem no ambiente simulado.');
  }

  async function ligarCamera() {
    const atual = s;
    try {
      status('Abrindo câmera…');
      await Visao.abrirCamera($('video'));
      if (s !== atual) return Visao.parar();
      status(Visao.modeloPronto ? '' : 'Carregando modelo de reconhecimento…');
      await Visao.carregarModelo();
      if (s !== atual) return;
      const classes = new Map(
        atual.catalogo.residuos
          .filter((r) => r.referencia_visual.startsWith('coco:'))
          .map((r) => [r.referencia_visual.slice(5), r])
      );
      Visao.iniciar($('video'), $('overlay'), classes, (dets, ms) => {
        status(dets.length
          ? `👁 ${dets.length} objeto(s) reconhecido(s) — toque no quadro para coletar (${Math.round(ms)} ms)`
          : '👁 Aponte a câmera para garrafas, copos, frutas, cadernos, talheres…');
      });
    } catch (e) {
      // RF18 — informa a falha e continua com os resíduos virtuais
      $('video').hidden = true;
      $('fundo-virtual').hidden = false;
      status(`⚠ ${mensagemCamera(e)} Continuando apenas com resíduos virtuais.`);
    }
  }

  function mensagemCamera(e) {
    if (e?.name === 'NotAllowedError') return 'Permissão da câmera negada.';
    if (e?.name === 'NotFoundError') return 'Nenhuma câmera encontrada.';
    return e?.message || 'Câmera indisponível.';
  }

  function status(texto) {
    $('status-visao').textContent = texto;
    $('status-visao').hidden = !texto;
  }

  function montarLixeiras() {
    const box = $('lixeiras');
    box.innerHTML = '';
    s.catalogo.lixeiras.forEach((l, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lixeira';
      b.style.background = l.cor;
      b.dataset.id = l.id_lixeira;
      b.setAttribute('aria-label', `Lixeira ${l.nome} (tecla ${i + 1})`);
      b.innerHTML = `<span class="ico">${l.icone}</span><span class="simbolo">${l.simbolo}</span><span>${l.nome}</span><span class="tecla">[${i + 1}]</span>`;
      b.onclick = () => descartar(l, b);
      box.appendChild(b);
    });
  }

  // ---------- Resíduos virtuais (RA) ----------
  function posicaoLivre() {
    const ocupadas = [...s.noCampo.values()].map((el) => [parseFloat(el.style.left), parseFloat(el.style.top)]);
    let melhor = null;
    for (let t = 0; t < 20; t++) {
      const p = [10 + Math.random() * 80, 24 + Math.random() * 40];
      const dist = Math.min(Infinity, ...ocupadas.map(([x, y]) => Math.hypot(x - p[0], (y - p[1]) * 1.6)));
      if (!melhor || dist > melhor.dist) melhor = { p, dist };
      if (dist > 25) break;
    }
    return melhor.p;
  }

  function gerarItem(item) {
    if (!item) {
      if (s.proximoItem >= s.partida.itens.length) return;
      item = s.partida.itens[s.proximoItem++];
    }
    const [x, y] = posicaoLivre();
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'item-virtual surgindo';
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.animationDelay = `0s, ${Math.random()}s`;
    el.setAttribute('aria-label', `Coletar ${item.nome}`);
    el.innerHTML = `<span class="emoji">${item.icone}</span><span class="nome">${item.nome}</span>`;
    el.onclick = (ev) => {
      ev.stopPropagation();
      coletar({ tipo: 'virtual', ...item });
    };
    s.noCampo.set(item.instancia, el);
    $('campo').appendChild(el);
  }

  // ---------- Coleta (RF07) ----------
  function coletar(obj) {
    if (s.encerrando) return;
    // devolve ao ambiente o resíduo virtual que estava na mão
    if (s.mao?.tipo === 'virtual' && s.mao.instancia !== obj.instancia) gerarItem(s.mao);
    if (obj.tipo === 'virtual') {
      s.noCampo.get(obj.instancia)?.remove();
      s.noCampo.delete(obj.instancia);
    }
    s.mao = obj;
    atualizarMao();
  }

  function cliqueNoCampo(ev) {
    const r = $('campo').getBoundingClientRect();
    const det = Visao.deteccaoEm(ev.clientX - r.left, ev.clientY - r.top);
    if (!det) return;
    coletar({
      tipo: 'real',
      instancia: `r-${++s.contadorReal}`,
      referencia_visual: `coco:${det.classe}`,
      nome: det.residuo.nome,
      icone: det.residuo.icone,
    });
  }

  function atualizarMao() {
    const m = $('mao');
    if (s.mao) {
      m.className = 'mao cheia';
      m.textContent = `${s.mao.icone} ${s.mao.nome}${s.mao.tipo === 'real' ? ' (objeto real)' : ''} — escolha a lixeira`;
    } else {
      m.className = 'mao';
      m.textContent = 'Toque em um resíduo para coletá-lo';
    }
  }

  // ---------- Descarte (RF08–RF11) ----------
  async function descartar(lixeira, botao) {
    if (s.encerrando || s.enviando) return;
    if (!s.mao) return mostrarFeedback('info', '<strong>Colete um resíduo primeiro.</strong> Toque em um item no ambiente.', 1800);

    const item = s.mao;
    const atual = s;
    s.mao = null;
    atualizarMao();
    definirLixeirasHabilitadas(false);

    s.enviando = Api.descartar(s.partida.id_partida, {
      instancia: item.instancia,
      id_lixeira: lixeira.id_lixeira,
      referencia_visual: item.referencia_visual,
    });
    try {
      const r = await s.enviando;
      if (atual !== s) return;
      atualizarHud(r.estado);
      animarLixeira(botao, r.correto);
      pontosVoando(botao, r.pontos + (r.bonus_sequencia || 0));
      if (r.correto) {
        mostrarFeedback('ok',
          `<strong>✓ Correto! +${r.pontos}</strong> ${r.residuo.icone} ${r.residuo.nome} → ${r.lixeira_correta.nome}` +
          (r.bonus_sequencia ? `<br>🔥 Sequência! <strong>+${r.bonus_sequencia}</strong> pontos extras` : ''),
          r.bonus_sequencia ? 2600 : 1400);
      } else {
        mostrarFeedback('erro',
          `<strong>✗ Descarte incorreto! ${r.pontos} pontos</strong><br>` +
          `${r.residuo.icone} ${r.residuo.nome} vai na lixeira <strong>${r.lixeira_correta.nome}</strong> ` +
          `<span class="simbolo">${r.lixeira_correta.simbolo}</span>, não em ${r.lixeira_escolhida}.<br>` +
          `<small>${r.explicacao}</small>`,
          6500);
      }
      if (item.tipo === 'virtual') gerarItem();
    } catch (e) {
      if (atual !== s) return;
      if (e.dados?.encerrada) return encerrar('tempo');
      if (item.tipo === 'virtual') e.dados?.duplicado ? gerarItem() : gerarItem(item);
      mostrarFeedback('erro', `<strong>⚠ ${e.message}</strong>`, 3500);
    } finally {
      if (atual === s) {
        s.enviando = null;
        definirLixeirasHabilitadas(true);
      }
    }
  }

  function definirLixeirasHabilitadas(hab) {
    document.querySelectorAll('.lixeira').forEach((b) => (b.disabled = !hab));
  }

  function animarLixeira(botao, correto) {
    botao.classList.remove('acerto', 'erro');
    void botao.offsetWidth;
    botao.classList.add(correto ? 'acerto' : 'erro');
  }

  function pontosVoando(botao, pontos) {
    const r = botao.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'pontos-voando';
    el.style.left = `${r.left + r.width / 2 - 20}px`;
    el.style.top = `${r.top - 30}px`;
    el.style.color = pontos >= 0 ? '#7CFFB0' : '#ff8a8a';
    el.textContent = pontos >= 0 ? `+${pontos}` : `${pontos}`;
    $('jogo').appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  function mostrarFeedback(tipo, html, ms) {
    const f = $('feedback');
    f.className = `feedback ${tipo}`;
    f.innerHTML = html;
    f.hidden = false;
    clearTimeout(s.feedbackTimer);
    s.feedbackTimer = setTimeout(() => (f.hidden = true), ms);
  }

  function atualizarHud(e) {
    $('hud-pontos').textContent = e.pontuacao;
    $('hud-acertos').textContent = e.acertos;
    $('hud-erros').textContent = e.erros;
    $('hud-seq').textContent = e.sequencia;
  }

  // ---------- Cronômetro (RF04) e encerramento (RF13) ----------
  function tick() {
    const restante = Math.max(0, s.fim - performance.now());
    const seg = Math.ceil(restante / 1000);
    $('hud-tempo').textContent = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
    $('hud-tempo').parentElement.classList.toggle('alerta', seg <= 10);
    if (restante <= 0) encerrar('tempo');
  }

  function teclado(ev) {
    const n = Number(ev.key);
    if (n >= 1 && n <= s.catalogo.lixeiras.length) {
      const botao = document.querySelectorAll('.lixeira')[n - 1];
      descartar(s.catalogo.lixeiras[n - 1], botao);
    }
  }

  async function encerrar(motivo) {
    if (!s || s.encerrando) return;
    const atual = s;
    s.encerrando = true;
    clearInterval(s.timer);
    definirLixeirasHabilitadas(false);
    status('Calculando resultado…');
    try { await s.enviando; } catch { /* já tratado */ }

    let resultado = null, erro = null;
    for (let tentativa = 0; tentativa < 3 && !resultado; tentativa++) {
      try {
        resultado = await Api.finalizar(atual.partida.id_partida, motivo);
      } catch (e) {
        erro = e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    limpar();
    atual.aoTerminar(resultado, resultado ? null : erro);
  }

  function limpar() {
    Visao.parar($('overlay'));
    document.removeEventListener('keydown', teclado);
    clearTimeout(s?.feedbackTimer);
    $('campo').innerHTML = '';
    $('jogo').hidden = true;
    $('app').hidden = false;
    s = null;
  }

  return { iniciar, get ativo() { return !!s; } };
})();
