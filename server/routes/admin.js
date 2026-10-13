const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { criarToken, exigirAdmin, limitador } = require('../auth');

const router = express.Router();

// Login do administrador/pesquisador. A senha vem da variável ADMIN_PASSWORD (RNF07).
router.post('/admin/login', limitador({ max: 10 }), (req, res) => {
  const senhaAdmin = process.env.ADMIN_PASSWORD;
  if (!senhaAdmin) return res.status(503).json({ erro: 'Acesso administrativo não configurado (ADMIN_PASSWORD).' });
  const senha = String(req.body?.senha || '');
  const a = crypto.createHash('sha256').update(senha).digest();
  const b = crypto.createHash('sha256').update(senhaAdmin).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ erro: 'Senha administrativa incorreta.' });
  res.json({ token: criarToken({ sub: 'admin', nome: 'Administrador', papel: 'admin' }) });
});

router.get('/admin/resumo', exigirAdmin, async (_req, res, next) => {
  try {
    const [geral, residuos, usuarios, partidas] = await Promise.all([
      pool.query(
        `SELECT (SELECT count(*) FROM usuario)::int AS usuarios,
                count(*)::int AS partidas,
                coalesce(avg(pontuacao_final) FILTER (WHERE status<>'em_andamento'),0)::int AS media_pontos,
                coalesce(sum(total_acertos),0)::int AS acertos, coalesce(sum(total_erros),0)::int AS erros
         FROM partida`
      ),
      pool.query(
        `SELECT r.nome, r.icone, l.nome AS lixeira_correta,
                count(e.id_evento)::int AS tentativas,
                count(e.id_evento) FILTER (WHERE NOT e.descarte_correto)::int AS erros
         FROM residuo r JOIN lixeira l ON l.id_lixeira=r.id_lixeira_correta
         LEFT JOIN evento_partida e ON e.id_residuo=r.id_residuo
         GROUP BY r.id_residuo, l.nome ORDER BY erros DESC, tentativas DESC`
      ),
      pool.query(
        `SELECT u.id_usuario, u.nome_exibicao, u.data_cadastro, u.ativo,
                count(p.id_partida)::int AS partidas, coalesce(max(p.pontuacao_final),0)::int AS melhor
         FROM usuario u LEFT JOIN partida p ON p.id_usuario=u.id_usuario
         GROUP BY u.id_usuario ORDER BY u.data_cadastro DESC LIMIT 200`
      ),
      pool.query(
        `SELECT p.id_partida, u.nome_exibicao, p.data_inicio, p.duracao_limite, p.duracao_segundos, p.pontuacao_final,
                p.total_acertos, p.total_erros, p.bonus_total, p.medalha, p.status, p.modo
         FROM partida p JOIN usuario u ON u.id_usuario=p.id_usuario
         ORDER BY p.data_inicio DESC LIMIT 100`
      ),
    ]);
    res.json({ geral: geral.rows[0], residuos: residuos.rows, usuarios: usuarios.rows, partidas: partidas.rows });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/usuarios/:id', exigirAdmin, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('UPDATE usuario SET ativo=$2 WHERE id_usuario::text=$1', [
      req.params.id,
      Boolean(req.body?.ativo),
    ]);
    if (!rowCount) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
