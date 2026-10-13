const test = require('node:test');
const assert = require('node:assert/strict');
const { CONFIG, avaliarDescarte, estadoDosEventos, calcularResultado, partidaAceitaAcoes } = require('../server/game/regras');

const acerto = { descarte_correto: true, pontos_evento: 100 };
const erro = { descarte_correto: false, pontos_evento: CONFIG.pontosErro };
const repetir = (ev, n) => Array.from({ length: n }, () => ev);

test('CT03 — descarte correto gera +100', () => {
  const r = avaliarDescarte({ id_lixeira_correta: 2 }, { id_lixeira: 2 }, 100);
  assert.deepEqual(r, { correto: true, pontos: 100 });
});

test('CT04 — descarte incorreto gera penalidade', () => {
  const r = avaliarDescarte({ id_lixeira_correta: 2 }, { id_lixeira: 5 }, 100);
  assert.deepEqual(r, { correto: false, pontos: -25 });
});

test('CT05 — bônus de sequência a cada 5 acertos seguidos', () => {
  assert.equal(estadoDosEventos(repetir(acerto, 4)).bonusSequencia.length, 0);
  assert.equal(estadoDosEventos(repetir(acerto, 5)).bonusSequencia.length, 1);
  assert.equal(estadoDosEventos(repetir(acerto, 10)).pontosSequencia, 100);
  // um erro zera a sequência
  const ev = [...repetir(acerto, 4), erro, ...repetir(acerto, 4)];
  assert.equal(estadoDosEventos(ev).bonusSequencia.length, 0);
  assert.equal(estadoDosEventos(ev).melhorSequencia, 4);
});

test('bônus de precisão exige 90% e mínimo de descartes', () => {
  const tipos = (ev) => calcularResultado(ev, 120).bonus.map((b) => b.tipo);
  assert.ok(!tipos(repetir(acerto, 4)).includes('precisao'));
  assert.ok(tipos([...repetir(acerto, 9), erro]).includes('precisao'));
  assert.ok(!tipos([...repetir(acerto, 8), erro, erro]).includes('precisao'));
});

test('bônus de eficiência ao atingir a meta de pontos', () => {
  const r = calcularResultado(repetir(acerto, 6), 60); // 600 >= 60 × 10
  assert.ok(r.bonus.some((b) => b.tipo === 'eficiencia'));
  assert.equal(r.medalha, 'ouro');
  const r2 = calcularResultado(repetir(acerto, 5), 60); // 500 < 600
  assert.ok(!r2.bonus.some((b) => b.tipo === 'eficiencia'));
});

test('CT07/RN08 — resultado final soma pontos, penalidades e bônus', () => {
  const ev = [...repetir(acerto, 5), erro];
  const r = calcularResultado(ev, 120);
  assert.equal(r.acertos, 5);
  assert.equal(r.erros, 1);
  assert.equal(r.pontosBase, 475);
  assert.equal(r.bonusTotal, 50); // só sequência (83% < 90%)
  assert.equal(r.pontuacaoFinal, 525);
});

test('pontuação final nunca é negativa', () => {
  const r = calcularResultado(repetir(erro, 4), 60);
  assert.equal(r.pontosBase, -100);
  assert.equal(r.pontuacaoFinal, 0);
  assert.equal(r.medalha, null);
});

test('CT06/RN06 — partida não aceita ações após o tempo', () => {
  const inicio = Date.now() - 61_000 - CONFIG.toleranciaMs;
  const p = { status: 'em_andamento', data_inicio: new Date(inicio), duracao_limite: 60 };
  assert.equal(partidaAceitaAcoes(p), false);
  assert.equal(partidaAceitaAcoes({ ...p, data_inicio: new Date() }), true);
  assert.equal(partidaAceitaAcoes({ ...p, data_inicio: new Date(), status: 'concluida' }), false);
});
