const crypto = require('crypto');

const TOKEN_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

let segredo = process.env.SESSION_SECRET;
if (!segredo) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Defina a variável de ambiente SESSION_SECRET em produção.');
  }
  segredo = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] SESSION_SECRET não definido — usando segredo temporário (tokens expiram ao reiniciar).');
}

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, sal, 64);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

function verificarSenha(senha, armazenado) {
  const [alg, salHex, hashHex] = String(armazenado).split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = crypto.scryptSync(senha, Buffer.from(salHex, 'hex'), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}

function assinar(dados) {
  return crypto.createHmac('sha256', segredo).update(dados).digest('base64url');
}

function criarToken(payload) {
  const corpo = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_VALIDADE_MS })).toString('base64url');
  return `${corpo}.${assinar(corpo)}`;
}

function lerToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [corpo, assinatura] = token.split('.');
  if (!corpo || !assinatura) return null;
  const esperada = Buffer.from(assinar(corpo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) return null;
  try {
    const payload = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function tokenDaRequisicao(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

/** Exige jogador autenticado. Disponibiliza req.usuario = { id, nome }. */
function exigirJogador(req, res, next) {
  const p = lerToken(tokenDaRequisicao(req));
  if (!p || p.papel !== 'jogador') return res.status(401).json({ erro: 'Sessão inválida ou expirada. Entre novamente.' });
  req.usuario = { id: p.sub, nome: p.nome };
  next();
}

/** Exige administrador/pesquisador (RNF07). */
function exigirAdmin(req, res, next) {
  const p = lerToken(tokenDaRequisicao(req));
  if (!p || p.papel !== 'admin') return res.status(403).json({ erro: 'Acesso restrito à administração.' });
  next();
}

/** Limitador simples em memória contra tentativas repetidas de login. */
function limitador({ janelaMs = 15 * 60 * 1000, max = 20 } = {}) {
  const tentativas = new Map();
  return (req, res, next) => {
    const agora = Date.now();
    const chave = req.ip;
    const reg = tentativas.get(chave);
    if (!reg || agora - reg.inicio > janelaMs) {
      tentativas.set(chave, { inicio: agora, n: 1 });
      return next();
    }
    if (++reg.n > max) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
    next();
  };
}

module.exports = { hashSenha, verificarSenha, criarToken, lerToken, exigirJogador, exigirAdmin, limitador };
