const express = require('express');
const crypto = require('crypto');
const { pool, transacao } = require('../db');
const { exigirJogador } = require('../auth');
const { CONFIG, avaliarDescarte, estadoDosEventos, calcularResultado, partidaAceitaAcoes } = require('../game/regras');

const router = express.Router();
router.use(exigirJogador);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ErroJogo extends Error {
  constructor(status, mensagem, extra = {}) {
    super(mensagem);
    this.status = status;
    this.extra = extra;
  }
}

async function eventosDaPartida(client, idPartida) {
  const { rows } = await client.query(
    'SELECT descarte_correto, pontos_evento FROM evento_partida WHERE id_partida = $1 ORDER BY id_evento',
    [idPartida]
  );
  return rows;
}

/** UC03 — Encerra a partida, aplica bonificações e grava o resultado (RF13–RF15). */
async function finalizar(client, partida, status) {
  const eventos = await eventosDaPartida(client, partida.id_partida);
  const r = calcularResultado(eventos, partida.duracao_limite);
  const inicio = new Date(partida.data_inicio).getTime();
  const fim = Math.min(Date.now(), inicio + partida.duracao_limite * 1000);
  const duracao = Math.max(0, Math.round((fim - inicio) / 1000));

  await client.query(
    `UPDATE partida SET status=$2, data_fim=$3, duracao_segundos=$4, pontuacao_final=$5,
       total_acertos=$6, total_erros=$7, bonus_total=$8, medalha=$9
     WHERE id_partida=$1`,
    [partida.id_partida, status, new Date(fim), duracao, r.pontuacaoFinal, r.acertos, r.erros, r.bonusTotal, r.medalha]
  );
  await client.query('DELETE FROM bonus WHERE id_partida = $1', [partida.id_partida]);
  for (const b of r.bonus) {
    await client.query('INSERT INTO bonus (id_partida, tipo, pontos, descricao) VALUES ($1,$2,$3,$4)', [
      partida.id_partida, b.tipo, b.pontos, b.descricao,
    ]);
  }
  return r;
}

/** Encerra partidas do usuário cujo tempo já acabou sem finalização pelo cliente. */
async function expirarPendentes(idUsuario) {
  const { rows } = await pool.query(
    `SELECT id_partida FROM partida WHERE id_usuario=$1 AND status='em_andamento'
       AND data_inicio + make_interval(secs => duracao_limite) < now()`,
    [idUsuario]
  );
  for (const { id_partida } of rows) {
    await transacao(async (c) => {
      const p = (await c.query("SELECT * FROM partida WHERE id_partida=$1 AND status='em_andamento' FOR UPDATE", [id_partida])).rows[0];
      if (p) await finalizar(c, p, 'expirada');
    });
  }
}

async function carregarPartidaDoUsuario(client, idPartida, idUsuario, bloquear = false) {
  if (!UUID.test(idPartida)) throw new ErroJogo(404, 'Partida não encontrada.');
  const { rows } = await client.query(
    `SELECT * FROM partida WHERE id_partida = $1 ${bloquear ? 'FOR UPDATE' : ''}`,
    [idPartida]
  );
  // CT10 — partidas de outros usuários são tratadas como inexistentes
  if (!rows[0] || rows[0].id_usuario !== idUsuario) throw new ErroJogo(404, 'Partida não encontrada.');
  return rows[0];
}

function sortearItens(residuos, quantidade) {
  const itens = [];
  for (let i = 0; i < quantidade; i++) {
    const r = residuos[crypto.randomInt(residuos.length)];
    itens.push({ instancia: `v-${i}`, id_residuo: r.id_residuo, nome: r.nome, icone: r.icone });
  }
  return itens;
}

// RF03/UC01 — Iniciar partida
router.post('/partidas', async (req, res, next) => {
  try {
    const duracao = Number(req.body?.duracao ?? CONFIG.duracaoPadrao);
    if (!CONFIG.duracoesPermitidas.includes(duracao)) {
      return res.status(400).json({ erro: `Duração inválida. Opções: ${CONFIG.duracoesPermitidas.join(', ')} segundos.` });
    }
    const modo = req.body?.modo === 'virtual' ? 'virtual' : 'camera';

    const partida = await transacao(async (c) => {
      // Apenas uma partida ativa por jogador: a anterior é registrada como interrompida (RN10)
      const abertas = await c.query(
        "SELECT * FROM partida WHERE id_usuario=$1 AND status='em_andamento' FOR UPDATE",
        [req.usuario.id]
      );
      for (const p of abertas.rows) await finalizar(c, p, 'interrompida');

      const residuos = (await c.query('SELECT id_residuo, nome, icone FROM residuo WHERE ativo')).rows;
      const itens = sortearItens(residuos, CONFIG.itensVirtuais);
      const { rows } = await c.query(
        `INSERT INTO partida (id_usuario, duracao_limite, modo, itens_virtuais)
         VALUES ($1,$2,$3,$4) RETURNING id_partida, data_inicio, duracao_limite, modo`,
        [req.usuario.id, duracao, modo, JSON.stringify(itens)]
      );
      return { ...rows[0], itens };
    });

    res.status(201).json({ ...partida, servidor_agora: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// RF07–RF11/UC02 — Coletar e descartar resíduo
router.post('/partidas/:id/descartes', async (req, res, next) => {
  try {
    const { instancia, id_lixeira, referencia_visual } = req.body || {};
    if (typeof instancia !== 'string' || !/^(v|r)-\d{1,6}$/.test(instancia)) {
      return res.status(400).json({ erro: 'Resíduo inválido.' });
    }

    const resultado = await transacao(async (c) => {
      const partida = await carregarPartidaDoUsuario(c, req.params.id, req.usuario.id, true);

      // RN06 — nenhuma ação após o encerramento
      if (!partidaAceitaAcoes(partida)) {
        if (partida.status === 'em_andamento') await finalizar(c, partida, 'concluida');
        throw new ErroJogo(409, 'A partida já foi encerrada. Novas ações não são contabilizadas.', { encerrada: true });
      }

      const lixeira = (await c.query('SELECT * FROM lixeira WHERE id_lixeira = $1', [Number(id_lixeira)])).rows[0];
      if (!lixeira) throw new ErroJogo(400, 'Lixeira inválida.');

      // Identifica o resíduo: virtual (sorteado pelo servidor) ou real (reconhecido pela câmera)
      let residuo;
      if (instancia.startsWith('v-')) {
        const item = partida.itens_virtuais[Number(instancia.slice(2))];
        if (!item) throw new ErroJogo(400, 'Resíduo inexistente nesta partida.');
        residuo = (await c.query('SELECT * FROM residuo WHERE id_residuo = $1', [item.id_residuo])).rows[0];
      } else {
        if (typeof referencia_visual !== 'string' || !referencia_visual.startsWith('coco:')) {
          throw new ErroJogo(400, 'Objeto reconhecido inválido.');
        }
        residuo = (await c.query('SELECT * FROM residuo WHERE referencia_visual = $1 AND ativo', [referencia_visual])).rows[0];
        if (!residuo) throw new ErroJogo(400, 'Este objeto não faz parte do jogo.');
        // Evita pontuar o mesmo objeto físico repetidamente enquanto continua em frente à câmera
        const recente = await c.query(
          `SELECT 1 FROM evento_partida WHERE id_partida=$1 AND id_residuo=$2 AND instancia LIKE 'r-%'
             AND instante_evento > now() - make_interval(secs => $3::double precision / 1000)`,
          [partida.id_partida, residuo.id_residuo, CONFIG.intervaloRealMs]
        );
        if (recente.rowCount) {
          throw new ErroJogo(409, 'Este objeto acabou de ser descartado. Retire-o da frente da câmera ou use outro.', { duplicado: true });
        }
      }

      const { correto, pontos } = avaliarDescarte(residuo, lixeira, lixeira.pontos_acerto);
      const antes = estadoDosEventos(await eventosDaPartida(c, partida.id_partida));

      await c.query('SAVEPOINT evento');
      try {
        await c.query(
          `INSERT INTO evento_partida (id_partida, id_residuo, id_lixeira_escolhida, instancia, descarte_correto, pontos_evento)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [partida.id_partida, residuo.id_residuo, lixeira.id_lixeira, instancia, correto, pontos]
        );
      } catch (err) {
        if (err.code === '23505') {
          await c.query('ROLLBACK TO SAVEPOINT evento');
          throw new ErroJogo(409, 'Este resíduo já foi descartado.', { duplicado: true }); // RN05/CT09
        }
        throw err;
      }

      const depois = estadoDosEventos(await eventosDaPartida(c, partida.id_partida));
      const lixeiraCorreta = correto
        ? lixeira
        : (await c.query('SELECT nome, cor, simbolo, icone FROM lixeira WHERE id_lixeira = $1', [residuo.id_lixeira_correta])).rows[0];

      return {
        correto,
        pontos,
        residuo: { nome: residuo.nome, icone: residuo.icone },
        lixeira_escolhida: lixeira.nome,
        lixeira_correta: { nome: lixeiraCorreta.nome, cor: lixeiraCorreta.cor, simbolo: lixeiraCorreta.simbolo },
        explicacao: correto ? null : residuo.explicacao, // RF11 — feedback educativo
        bonus_sequencia: depois.bonusSequencia.length > antes.bonusSequencia.length ? CONFIG.sequencia.pontos : 0,
        estado: {
          pontuacao: depois.pontuacaoParcial,
          acertos: depois.acertos,
          erros: depois.erros,
          sequencia: depois.sequenciaAtual,
        },
      };
    });

    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// UC03 — Encerrar partida (fim do tempo ou desistência)
router.post('/partidas/:id/finalizar', async (req, res, next) => {
  try {
    const desistencia = req.body?.motivo === 'abandono';
    await transacao(async (c) => {
      const partida = await carregarPartidaDoUsuario(c, req.params.id, req.usuario.id, true);
      if (partida.status !== 'em_andamento') return; // idempotente
      const fimPrevisto = new Date(partida.data_inicio).getTime() + partida.duracao_limite * 1000;
      const tempoAcabou = Date.now() >= fimPrevisto - CONFIG.toleranciaMs;
      await finalizar(c, partida, desistencia && !tempoAcabou ? 'interrompida' : 'concluida');
    });
    res.json(await detalhePartida(req.params.id, req.usuario.id));
  } catch (err) {
    next(err);
  }
});

async function detalhePartida(idPartida, idUsuario) {
  const partida = await carregarPartidaDoUsuario(pool, idPartida, idUsuario);
  const [eventos, bonus] = await Promise.all([
    pool.query(
      `SELECT e.instante_evento, e.descarte_correto, e.pontos_evento,
              r.nome AS residuo, r.icone, l.nome AS lixeira_escolhida, lc.nome AS lixeira_correta
       FROM evento_partida e
       JOIN residuo r ON r.id_residuo = e.id_residuo
       JOIN lixeira l ON l.id_lixeira = e.id_lixeira_escolhida
       JOIN lixeira lc ON lc.id_lixeira = r.id_lixeira_correta
       WHERE e.id_partida = $1 ORDER BY e.id_evento`,
      [idPartida]
    ),
    pool.query('SELECT tipo, pontos, descricao FROM bonus WHERE id_partida = $1 ORDER BY id_bonus', [idPartida]),
  ]);
  const { itens_virtuais, id_usuario, ...dados } = partida;
  const total = dados.total_acertos + dados.total_erros;
  return {
    ...dados,
    taxa_acerto: total ? dados.total_acertos / total : 0,
    pontos_base: eventos.rows.reduce((s, e) => s + e.pontos_evento, 0),
    eventos: eventos.rows,
    bonus: bonus.rows,
  };
}

// UC04/RF16 — Histórico de partidas do próprio usuário
router.get('/partidas', async (req, res, next) => {
  try {
    await expirarPendentes(req.usuario.id);
    const { rows } = await pool.query(
      `SELECT id_partida, data_inicio, data_fim, duracao_limite, duracao_segundos, pontuacao_final,
              total_acertos, total_erros, bonus_total, medalha, status, modo
       FROM partida WHERE id_usuario = $1 ORDER BY data_inicio DESC LIMIT 100`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/partidas/:id', async (req, res, next) => {
  try {
    await expirarPendentes(req.usuario.id);
    res.json(await detalhePartida(req.params.id, req.usuario.id));
  } catch (err) {
    next(err);
  }
});

// RF17 — Estatísticas de desempenho
router.get('/estatisticas', async (req, res, next) => {
  try {
    await expirarPendentes(req.usuario.id);
    const id = req.usuario.id;
    const [geral, evolucao, porCategoria, maisErrados] = await Promise.all([
      pool.query(
        `SELECT count(*)::int AS partidas, coalesce(sum(pontuacao_final),0)::int AS total_pontos,
                coalesce(max(pontuacao_final),0)::int AS melhor_pontuacao,
                coalesce(sum(total_acertos),0)::int AS acertos, coalesce(sum(total_erros),0)::int AS erros,
                coalesce(sum(bonus_total),0)::int AS bonus,
                count(*) FILTER (WHERE medalha='ouro')::int AS ouro,
                count(*) FILTER (WHERE medalha='prata')::int AS prata,
                count(*) FILTER (WHERE medalha='bronze')::int AS bronze
         FROM partida WHERE id_usuario=$1 AND status <> 'em_andamento'`,
        [id]
      ),
      pool.query(
        `SELECT * FROM (SELECT data_inicio, pontuacao_final, total_acertos, total_erros FROM partida
           WHERE id_usuario=$1 AND status <> 'em_andamento' ORDER BY data_inicio DESC LIMIT 15) t
         ORDER BY data_inicio`,
        [id]
      ),
      pool.query(
        `SELECT l.nome AS categoria, l.cor, l.simbolo,
                count(*) FILTER (WHERE e.descarte_correto)::int AS acertos,
                count(*) FILTER (WHERE NOT e.descarte_correto)::int AS erros
         FROM evento_partida e JOIN partida p ON p.id_partida=e.id_partida
         JOIN residuo r ON r.id_residuo=e.id_residuo JOIN lixeira l ON l.id_lixeira=r.id_lixeira_correta
         WHERE p.id_usuario=$1 GROUP BY l.id_lixeira ORDER BY l.id_lixeira`,
        [id]
      ),
      pool.query(
        `SELECT r.nome, r.icone, count(*)::int AS erros FROM evento_partida e
         JOIN partida p ON p.id_partida=e.id_partida JOIN residuo r ON r.id_residuo=e.id_residuo
         WHERE p.id_usuario=$1 AND NOT e.descarte_correto GROUP BY r.id_residuo ORDER BY erros DESC LIMIT 5`,
        [id]
      ),
    ]);
    res.json({ geral: geral.rows[0], evolucao: evolucao.rows, por_categoria: porCategoria.rows, mais_errados: maisErrados.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, ErroJogo };
