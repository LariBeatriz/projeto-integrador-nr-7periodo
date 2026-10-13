// Módulo de visão computacional (seção 7.2):
// captura da câmera → processamento → detecção (COCO-SSD) → posição na tela → lógica do jogo.
// Todo o processamento ocorre no navegador; nenhuma imagem é enviada ao servidor (RNF08).
const Visao = (() => {
  const CDN = [
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js',
  ];
  const CONFIANCA_MIN = 0.55;
  const INTERVALO_MS = 200;

  let modelo = null;
  let carregando = null;
  let stream = null;
  let ativo = false;
  let deteccoes = []; // [{classe, score, x, y, w, h}] em coordenadas da tela

  function carregarScript(src) {
    return new Promise((ok, falha) => {
      if (document.querySelector(`script[src="${src}"]`)) return ok();
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => falha(new Error('Falha ao baixar o modelo de visão computacional.'));
      document.head.appendChild(s);
    });
  }

  function carregarModelo() {
    if (modelo) return Promise.resolve(modelo);
    if (!carregando) {
      carregando = (async () => {
        for (const src of CDN) await carregarScript(src);
        modelo = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
        return modelo;
      })().catch((e) => {
        carregando = null;
        throw e;
      });
    }
    return carregando;
  }

  async function abrirCamera(video) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este navegador não permite acesso à câmera (é necessário HTTPS).');
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    video.srcObject = stream;
    await video.play();
  }

  // Converte coordenadas do vídeo para a tela considerando object-fit: cover
  function paraTela(video, [x, y, w, h]) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const cw = video.clientWidth, ch = video.clientHeight;
    const escala = Math.max(cw / vw, ch / vh);
    const dx = (cw - vw * escala) / 2, dy = (ch - vh * escala) / 2;
    return { x: x * escala + dx, y: y * escala + dy, w: w * escala, h: h * escala };
  }

  /**
   * Inicia o laço de detecção.
   * @param {HTMLVideoElement} video
   * @param {HTMLCanvasElement} canvas
   * @param {Map<string, {nome:string, icone:string}>} classesDoJogo  classe COCO → resíduo
   * @param {(det:Array)=>void} aoDetectar
   */
  function iniciar(video, canvas, classesDoJogo, aoDetectar) {
    ativo = true;
    const ctx = canvas.getContext('2d');

    const laco = async () => {
      if (!ativo) return;
      const t0 = performance.now();
      try {
        if (video.readyState >= 2 && modelo) {
          const brutas = await modelo.detect(video, 10, CONFIANCA_MIN);
          deteccoes = brutas
            .filter((d) => classesDoJogo.has(d.class))
            .map((d) => ({ classe: d.class, score: d.score, ...paraTela(video, d.bbox), residuo: classesDoJogo.get(d.class) }));
          desenhar(ctx, canvas);
          aoDetectar?.(deteccoes, performance.now() - t0);
        }
      } catch (e) {
        console.warn('Falha na detecção', e);
      }
      setTimeout(laco, Math.max(0, INTERVALO_MS - (performance.now() - t0)));
    };
    laco();
  }

  function desenhar(ctx, canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 3;
    ctx.font = 'bold 15px system-ui, sans-serif';
    for (const d of deteccoes) {
      ctx.strokeStyle = '#ffeb3b';
      ctx.setLineDash([10, 6]);
      ctx.strokeRect(d.x, d.y, d.w, d.h);
      ctx.setLineDash([]);
      const rotulo = `${d.residuo.icone} ${d.residuo.nome} ${Math.round(d.score * 100)}% — toque para coletar`;
      const lw = ctx.measureText(rotulo).width + 12;
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      ctx.fillRect(d.x, Math.max(0, d.y - 24), lw, 22);
      ctx.fillStyle = '#ffeb3b';
      ctx.fillText(rotulo, d.x + 6, Math.max(16, d.y - 8));
    }
  }

  /** Retorna a detecção sob o ponto (x, y) da tela, se houver. */
  function deteccaoEm(x, y) {
    return deteccoes
      .filter((d) => x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0] || null;
  }

  function parar(canvas) {
    ativo = false;
    deteccoes = [];
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  return { carregarModelo, abrirCamera, iniciar, deteccaoEm, parar, get modeloPronto() { return !!modelo; } };
})();
