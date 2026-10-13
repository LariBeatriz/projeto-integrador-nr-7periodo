const express = require('express');
const { pool } = require('../db');
const { hashSenha, verificarSenha, criarToken, exigirJogador, limitador } = require('../auth');
const { CONFIG } = require('../game/regras');

const router = express.Router();
const NOME_VALIDO = /^[\p{L}\p{N} _.-]{3,30}$/u;

function validar(nome, senha) {
  if (typeof nome !== 'string' || !NOME_VALIDO.test(nome.trim())) {
    return 'O nome deve ter de 3 a 30 caracteres (letras, números, espaço, ponto, hífen ou sublinhado).';
  }
  if (typeof senha !== 'string' || senha.length < 4 || senha.length > 100) {
    return 'A senha deve ter pelo menos 4 caracteres.';
  }
  return null;
}

function sessao(usuario) {
  return {
    token: criarToken({ sub: usuario.id_usuario, nome: usuario.nome_exibicao, papel: 'jogador' }),
    usuario: { id: usuario.id_usuario, nome: usuario.nome_exibicao, data_cadastro: usuario.data_cadastro },
  };
}

// RF02 — Cadastro de usuário (somente dados mínimos: apelido + senha — RNF08)
router.post('/usuarios', limitador(), async (req, res, next) => {
  try {
    const { nome, senha } = req.body || {};
    const erro = validar(nome, senha);
    if (erro) return res.status(400).json({ erro });
    const { rows } = await pool.query(
      `INSERT INTO usuario (nome_exibicao, senha_hash) VALUES ($1, $2)
       RETURNING id_usuario, nome_exibicao, data_cadastro`,
      [nome.trim(), hashSenha(senha)]
    );
    res.status(201).json(sessao(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ erro: 'Este nome já está em uso. Escolha outro.' });
    next(err);
  }
});

// RF01 — Identificação do usuário
router.post('/sessoes', limitador(), async (req, res, next) => {
  try {
    const { nome, senha } = req.body || {};
    if (typeof nome !== 'string' || typeof senha !== 'string') {
      return res.status(400).json({ erro: 'Informe nome e senha.' });
    }
    const { rows } = await pool.query(
      'SELECT id_usuario, nome_exibicao, senha_hash, data_cadastro, ativo FROM usuario WHERE lower(nome_exibicao) = lower($1)',
      [nome.trim()]
    );
    const u = rows[0];
    if (!u || !verificarSenha(senha, u.senha_hash)) return res.status(401).json({ erro: 'Nome ou senha incorretos.' });
    if (!u.ativo) return res.status(403).json({ erro: 'Este cadastro está desativado.' });
    res.json(sessao(u));
  } catch (err) {
    next(err);
  }
});

router.get('/eu', exigirJogador, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id_usuario, nome_exibicao, data_cadastro, ativo FROM usuario WHERE id_usuario = $1',
      [req.usuario.id]
    );
    if (!rows[0] || !rows[0].ativo) return res.status(401).json({ erro: 'Sessão inválida.' });
    res.json({ id: rows[0].id_usuario, nome: rows[0].nome_exibicao, data_cadastro: rows[0].data_cadastro });
  } catch (err) {
    next(err);
  }
});

// Catálogo público: lixeiras e resíduos. A lixeira correta NÃO é enviada ao cliente,
// para que a validação do descarte aconteça somente no servidor (RF09).
router.get('/catalogo', async (_req, res, next) => {
  try {
    const [lixeiras, residuos] = await Promise.all([
      pool.query('SELECT id_lixeira, codigo, nome, categoria, cor, simbolo, icone, identificador_visual FROM lixeira ORDER BY id_lixeira'),
      pool.query('SELECT id_residuo, nome, icone, referencia_visual FROM residuo WHERE ativo ORDER BY id_residuo'),
    ]);
    res.json({
      lixeiras: lixeiras.rows,
      residuos: residuos.rows,
      regras: {
        duracoes: CONFIG.duracoesPermitidas,
        duracaoPadrao: CONFIG.duracaoPadrao,
        pontosErro: CONFIG.pontosErro,
        pontosAcerto: 100,
        sequencia: CONFIG.sequencia,
        precisao: CONFIG.precisao,
        eficiencia: CONFIG.eficiencia,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
