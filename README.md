# ♻️ EcoAR — Jogo de Reciclagem com Realidade Aumentada e Visão Computacional

Protótipo do documento de requisitos EcoAR v1.0. Como os óculos de RA não estão disponíveis, ele segue a
alternativa prevista na seção 3.2: **câmera de celular ou computador + interface web de RA**.

## Como funciona

| Módulo (seção 7.4) | Implementação |
|---|---|
| Câmera | `getUserMedia` (câmera traseira no celular) |
| Visão computacional | TensorFlow.js + **COCO-SSD** (detecção de objetos, rodando no próprio navegador) — `public/js/visao.js` |
| Realidade aumentada | Quadros de detecção e resíduos virtuais sobrepostos ao vídeo da câmera — `public/js/jogo.js` |
| Lógica do jogo, pontuação e bônus | Servidor Node.js (validação dos descartes no servidor) — `server/game/regras.js` |
| Banco de dados | PostgreSQL (modelo da seção 8 + tabela `bonus`) — `server/db.js` |
| Histórico e estatísticas | `server/routes/partidas.js` + telas em `public/js/app.js` |

**Interação (seção 7.2):** reconhecer não é o mesmo que coletar. Para coletar, o jogador **toca no quadro amarelo** do
objeto reconhecido (ou em um resíduo virtual). Depois, toca na lixeira desejada (ou usa as teclas 1–5).

**Objetos reais reconhecidos:** garrafa, copo, taça, banana, maçã, laranja, livro/caderno, garfo, colher e tesoura.
Há também 11 resíduos apenas virtuais (lata, jornal, papelão, pote de vidro etc.). O catálogo e as mensagens educativas
ficam em `server/game/catalogo.js` e são gravados no banco ao iniciar o sistema.

**Privacidade (RNF08):** as imagens da câmera são processadas no aparelho e nunca vão para o servidor. O cadastro guarda
apenas apelido e senha (com hash scrypt).

## Regras implementadas (seção 6)

| Evento | Pontos |
|---|---|
| Descarte correto | +100 |
| Descarte incorreto | −25 + explicação educativa |
| 🔥 Sequência: a cada 5 acertos seguidos | +50 |
| 🎯 Precisão: ≥ 90% de acertos (mínimo de 5 descartes) | +100 |
| ⚡ Eficiência: atingir 10 pts × segundos da partida (ex.: 600 em 60 s) | +150 |

- Tempo limite configurável: 60, 90 ou 120 s (o servidor confere o prazo, com tolerância de 1,5 s).
- A pontuação final nunca fica negativa. Cada resíduo pontua uma única vez (RN05).
- Nenhuma ação conta depois do fim da partida (RN06). Desistir também registra o resultado (RN10).
- Medalhas: 🥇 ouro (precisão + eficiência), 🥈 prata (algum bônus), 🥉 bronze (pelo menos um acerto).

Para ajustar os valores, edite `CONFIG` em `server/game/regras.js`.

## Perfis

- **Jogador:** cadastro/login, partidas, histórico e estatísticas próprios (não acessa dados de outros jogadores — CT10).
- **Administrador/pesquisador:** acessa `/#/admin` com a senha `ADMIN_PASSWORD`. Vê todas as partidas, a taxa de erro
  por resíduo e a lista de usuários, e pode ativar ou desativar cadastros.

## Rodando localmente

```bash
cp .env.example .env
docker compose --env-file .env up -d --build
```

Acesse http://localhost:3000. Em `localhost`, a câmera funciona sem HTTPS. Para testar no celular, use o deploy com HTTPS.

Testes das regras de negócio:

```bash
npm test
```

## Deploy no Coolify

1. Suba este repositório para o GitHub (ou outro Git).
2. No Coolify, crie um recurso **Docker Compose** a partir do repositório (Build Pack: *Docker Compose*, arquivo `docker-compose.yml`).
3. Em **Environment Variables**, defina:
   - `SESSION_SECRET`: um valor aleatório longo (ex.: `openssl rand -hex 32`)
   - `ADMIN_PASSWORD`: a senha da área do pesquisador
   - `POSTGRES_PASSWORD`: a senha do banco
4. No serviço `app`, configure o domínio (ex.: `https://ecoar.seudominio.com`). **HTTPS é obrigatório para a câmera no celular.**
5. Faça o deploy. As tabelas são criadas automaticamente. A verificação de saúde fica em `/api/health`.

Os dados ficam no volume `ecoar-db` e permanecem entre os deploys (RNF06).

## Próximas evoluções sugeridas

- Marcadores ArUco para lixeiras físicas e detecção do descarte pela posição.
- Rastreamento de mãos (MediaPipe) para coletar com gesto de pinça.
- Modelo YOLO treinado com resíduos reais (latas, embalagens longa vida etc.).
- WebXR / óculos de RA quando o equipamento estiver disponível.
- Ranking global e desafios entre usuários.
