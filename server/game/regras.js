// Regras de negócio do EcoAR (seções 6, 6.1 e 6.2 do documento de requisitos).
// Módulo puro, sem acesso a banco, para facilitar testes e manutenção (RNF09).

const CONFIG = Object.freeze({
  duracoesPermitidas: [60, 90, 120], // RN01 — tempo limite predefinido (segundos)
  duracaoPadrao: 90,
  pontosErro: -25, // RN04 — penalidade por descarte incorreto
  sequencia: { tamanho: 5, pontos: 50 }, // bônus de sequência (a cada 5 acertos seguidos)
  precisao: { taxaMinima: 0.9, minimoDescartes: 5, pontos: 100 }, // bônus de precisão
  eficiencia: { pontosPorSegundo: 10, pontos: 150 }, // meta = duração × 10 pontos
  toleranciaMs: 1500, // margem para latência de rede ao final do cronômetro
  pontuacaoMinimaZero: true, // a pontuação final nunca é negativa
  itensVirtuais: 40, // resíduos virtuais gerados por partida
  intervaloRealMs: 4000, // intervalo mínimo entre descartes do mesmo objeto real
});

/** Avalia um descarte isolado (RN03/RN04). */
function avaliarDescarte(residuo, lixeiraEscolhida, pontosAcerto = 100) {
  const correto = residuo.id_lixeira_correta === lixeiraEscolhida.id_lixeira;
  return { correto, pontos: correto ? pontosAcerto : CONFIG.pontosErro };
}

/**
 * Recalcula o estado da partida a partir da lista ordenada de eventos.
 * Toda a pontuação deriva dos eventos registrados (RNF05 — consistência).
 * @param {{descarte_correto:boolean, pontos_evento:number}[]} eventos
 */
function estadoDosEventos(eventos) {
  let acertos = 0;
  let erros = 0;
  let pontosBase = 0;
  let sequenciaAtual = 0;
  let melhorSequencia = 0;
  const bonusSequencia = []; // índice do evento que gerou o bônus

  eventos.forEach((ev, i) => {
    pontosBase += ev.pontos_evento;
    if (ev.descarte_correto) {
      acertos++;
      sequenciaAtual++;
      melhorSequencia = Math.max(melhorSequencia, sequenciaAtual);
      if (sequenciaAtual % CONFIG.sequencia.tamanho === 0) bonusSequencia.push(i);
    } else {
      erros++;
      sequenciaAtual = 0;
    }
  });

  const pontosSequencia = bonusSequencia.length * CONFIG.sequencia.pontos;
  return {
    acertos,
    erros,
    pontosBase,
    sequenciaAtual,
    melhorSequencia,
    bonusSequencia,
    pontosSequencia,
    pontuacaoParcial: pontosBase + pontosSequencia,
  };
}

/** Calcula o resultado final com todas as bonificações elegíveis (RN07/RN08). */
function calcularResultado(eventos, duracaoLimite) {
  const est = estadoDosEventos(eventos);
  const total = est.acertos + est.erros;
  const taxaAcerto = total > 0 ? est.acertos / total : 0;
  const bonus = [];

  if (est.bonusSequencia.length > 0) {
    bonus.push({
      tipo: 'sequencia',
      pontos: est.pontosSequencia,
      descricao: `${est.bonusSequencia.length}× sequência de ${CONFIG.sequencia.tamanho} acertos seguidos`,
    });
  }

  if (total >= CONFIG.precisao.minimoDescartes && taxaAcerto >= CONFIG.precisao.taxaMinima) {
    bonus.push({
      tipo: 'precisao',
      pontos: CONFIG.precisao.pontos,
      descricao: `Precisão de ${Math.round(taxaAcerto * 100)}% (mínimo ${CONFIG.precisao.taxaMinima * 100}% em ${CONFIG.precisao.minimoDescartes}+ descartes)`,
    });
  }

  const meta = metaEficiencia(duracaoLimite);
  if (est.pontosBase >= meta) {
    bonus.push({
      tipo: 'eficiencia',
      pontos: CONFIG.eficiencia.pontos,
      descricao: `Meta de ${meta} pontos alcançada dentro do tempo`,
    });
  }

  const bonusTotal = bonus.reduce((s, b) => s + b.pontos, 0);
  let pontuacaoFinal = est.pontosBase + bonusTotal;
  if (CONFIG.pontuacaoMinimaZero) pontuacaoFinal = Math.max(0, pontuacaoFinal);

  return {
    acertos: est.acertos,
    erros: est.erros,
    pontosBase: est.pontosBase,
    melhorSequencia: est.melhorSequencia,
    taxaAcerto,
    bonus,
    bonusTotal,
    pontuacaoFinal,
    metaEficiencia: meta,
    medalha: medalha(bonus, est.acertos),
  };
}

function metaEficiencia(duracaoLimite) {
  return duracaoLimite * CONFIG.eficiencia.pontosPorSegundo;
}

/** Nível de desempenho exibido ao jogador. */
function medalha(bonus, acertos) {
  const tipos = new Set(bonus.map((b) => b.tipo));
  if (tipos.has('precisao') && tipos.has('eficiencia')) return 'ouro';
  if (tipos.size > 0) return 'prata';
  if (acertos > 0) return 'bronze';
  return null;
}

/** Verifica se a partida ainda aceita ações (RN06). */
function partidaAceitaAcoes(partida, agora = Date.now()) {
  if (partida.status !== 'em_andamento') return false;
  const limite = new Date(partida.data_inicio).getTime() + partida.duracao_limite * 1000 + CONFIG.toleranciaMs;
  return agora <= limite;
}

module.exports = { CONFIG, avaliarDescarte, estadoDosEventos, calcularResultado, metaEficiencia, partidaAceitaAcoes };
