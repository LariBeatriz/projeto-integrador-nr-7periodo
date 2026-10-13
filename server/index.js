const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { pool, migrar } = require('./db');
const usuarios = require('./routes/usuarios');
const { router: partidas, ErroJogo } = require('./routes/partidas');
const admin = require('./routes/admin');

const app = express();
app.set('trust proxy', 1); // atrás do proxy do Coolify (Traefik/Caddy)

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-eval'"], // TF.js compila kernels
        connectSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://storage.googleapis.com', 'https://tfhub.dev', 'https://www.kaggle.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: '20kb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use('/api', usuarios);
app.use('/api', admin);
app.use('/api', partidas);
app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// RF18 — falhas são informadas ao usuário com mensagem compreensível
app.use((err, _req, res, _next) => {
  if (err instanceof ErroJogo) return res.status(err.status).json({ erro: err.message, ...err.extra });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Requisição inválida.' });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente.' });
});

const PORT = Number(process.env.PORT || 3000);

async function iniciar() {
  for (let tentativa = 1; ; tentativa++) {
    try {
      await migrar();
      break;
    } catch (err) {
      if (tentativa >= 15) throw err;
      console.log(`[db] aguardando banco (${tentativa}/15): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  app.listen(PORT, () => console.log(`EcoAR rodando na porta ${PORT}`));
}

iniciar().catch((err) => {
  console.error('Falha ao iniciar:', err);
  process.exit(1);
});
