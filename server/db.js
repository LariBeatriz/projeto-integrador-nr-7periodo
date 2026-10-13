const { Pool } = require('pg');
const { LIXEIRAS, RESIDUOS } = require('./game/catalogo');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://ecoar:ecoar@localhost:5432/ecoar',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

// Modelagem da seção 8 do documento (+ tabela BONUS sugerida em 8.6).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuario (
  id_usuario     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_exibicao  TEXT NOT NULL,
  senha_hash     TEXT NOT NULL,
  data_cadastro  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ativo          BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_nome_unico ON usuario (lower(nome_exibicao));

CREATE TABLE IF NOT EXISTS lixeira (
  id_lixeira           SERIAL PRIMARY KEY,
  codigo               TEXT NOT NULL UNIQUE,
  nome                 TEXT NOT NULL,
  categoria            TEXT NOT NULL,
  identificador_visual TEXT NOT NULL,
  cor                  TEXT NOT NULL,
  simbolo              TEXT NOT NULL,
  icone                TEXT NOT NULL,
  pontos_acerto        INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS residuo (
  id_residuo         SERIAL PRIMARY KEY,
  nome               TEXT NOT NULL,
  categoria          TEXT NOT NULL,
  id_lixeira_correta INTEGER NOT NULL REFERENCES lixeira(id_lixeira),
  explicacao         TEXT NOT NULL,
  referencia_visual  TEXT NOT NULL UNIQUE,
  icone              TEXT NOT NULL,
  ativo              BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS partida (
  id_partida       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario       UUID NOT NULL REFERENCES usuario(id_usuario),
  data_inicio      TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_fim         TIMESTAMPTZ,
  duracao_limite   INTEGER NOT NULL,
  duracao_segundos INTEGER,
  pontuacao_final  INTEGER NOT NULL DEFAULT 0,
  total_acertos    INTEGER NOT NULL DEFAULT 0,
  total_erros      INTEGER NOT NULL DEFAULT 0,
  bonus_total      INTEGER NOT NULL DEFAULT 0,
  medalha          TEXT,
  status           TEXT NOT NULL DEFAULT 'em_andamento'
                   CHECK (status IN ('em_andamento','concluida','interrompida','expirada')),
  modo             TEXT NOT NULL DEFAULT 'camera',
  itens_virtuais   JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS partida_usuario ON partida (id_usuario, data_inicio DESC);

CREATE TABLE IF NOT EXISTS evento_partida (
  id_evento            BIGSERIAL PRIMARY KEY,
  id_partida           UUID NOT NULL REFERENCES partida(id_partida) ON DELETE CASCADE,
  id_residuo           INTEGER NOT NULL REFERENCES residuo(id_residuo),
  id_lixeira_escolhida INTEGER NOT NULL REFERENCES lixeira(id_lixeira),
  instancia            TEXT NOT NULL,
  instante_evento      TIMESTAMPTZ NOT NULL DEFAULT now(),
  descarte_correto     BOOLEAN NOT NULL,
  pontos_evento        INTEGER NOT NULL,
  UNIQUE (id_partida, instancia)  -- RN05: o mesmo resíduo não pontua duas vezes
);

CREATE TABLE IF NOT EXISTS bonus (
  id_bonus   SERIAL PRIMARY KEY,
  id_partida UUID NOT NULL REFERENCES partida(id_partida) ON DELETE CASCADE,
  tipo       TEXT NOT NULL CHECK (tipo IN ('sequencia','precisao','eficiencia')),
  pontos     INTEGER NOT NULL,
  descricao  TEXT NOT NULL,
  UNIQUE (id_partida, tipo)
);
`;

async function migrar() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(424242)'); // evita migração concorrente
    await client.query(SCHEMA);

    for (const l of LIXEIRAS) {
      await client.query(
        `INSERT INTO lixeira (codigo, nome, categoria, identificador_visual, cor, simbolo, icone, pontos_acerto)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (codigo) DO UPDATE SET nome=EXCLUDED.nome, categoria=EXCLUDED.categoria,
           identificador_visual=EXCLUDED.identificador_visual, cor=EXCLUDED.cor, simbolo=EXCLUDED.simbolo,
           icone=EXCLUDED.icone, pontos_acerto=EXCLUDED.pontos_acerto`,
        [l.codigo, l.nome, l.categoria, `lixeira:${l.codigo}`, l.cor, l.simbolo, l.icone, l.pontos_acerto]
      );
    }

    const { rows } = await client.query('SELECT id_lixeira, codigo, categoria FROM lixeira');
    const porCodigo = Object.fromEntries(rows.map((r) => [r.codigo, r]));
    for (const r of RESIDUOS) {
      const lx = porCodigo[r.lixeira];
      await client.query(
        `INSERT INTO residuo (nome, categoria, id_lixeira_correta, explicacao, referencia_visual, icone)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (referencia_visual) DO UPDATE SET nome=EXCLUDED.nome, categoria=EXCLUDED.categoria,
           id_lixeira_correta=EXCLUDED.id_lixeira_correta, explicacao=EXCLUDED.explicacao, icone=EXCLUDED.icone`,
        [r.nome, lx.categoria, lx.id_lixeira, r.explicacao, r.referencia_visual, r.icone]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Executa fn dentro de uma transação (RNF05/risco de perda de dados). */
async function transacao(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, migrar, transacao };
