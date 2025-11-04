/**
 * app.js
 *
 * Este módulo implementa toda a lógica do jogo de quiz em tempo real usando
 * Firebase Realtime Database e Auth Anônima. O código é estruturado em
 * classes e utilitários para separar UI, lógica de jogo e integração com
 * dados. Comentários de JSDoc explicam funções principais. Os imports
 * utilizam a sintaxe modular da SDK v9 do Firebase.
 */

// Importações do Firebase (modular v9). Ao configurar o projeto, preencha
// firebaseConfig com as chaves públicas fornecidas pelo console do Firebase.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.11/firebase-app.js';
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  push,
  remove,
  serverTimestamp,
  get,
  child
} from 'https://www.gstatic.com/firebasejs/9.6.11/firebase-database.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.6.11/firebase-auth.js';

// =====================================================================
// Configuração do Firebase
// Substitua os valores abaixo pelas suas credenciais do Firebase. Estas
// chaves são públicas e podem ser embutidas no cliente. Veja o README
// para instruções de obtenção.
const firebaseConfig = {
  // Credenciais reais do projeto Firebase fornecidas pelo usuário. Estas
  // chaves são públicas e podem ser embutidas no cliente.
  apiKey: 'AIzaSyDo4iQm4kyqO7L_85H-3Ma2bIbLinzFBuM',
  authDomain: 'prev-perdas.firebaseapp.com',
  databaseURL: 'https://prev-perdas-default-rtdb.firebaseio.com',
  projectId: 'prev-perdas',
  // URL do bucket de armazenamento (opcional). No Firebase, geralmente tem
  // o formato <projectId>.appspot.com. Ajuste conforme seu projeto se
  // utilizar Storage. Ainda que não usemos storage neste app, manter o valor
  // correto evita erros de inicialização.
  storageBucket: 'prev-perdas.appspot.com',
  messagingSenderId: '929112958553',
  appId: '1:929112958553:web:c9fe9c4051755e533af348',
  measurementId: 'G-51MW56MWRQ'
};

// Inicializa Firebase App, Auth e Database
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// =====================================================================
// Utilitários

/**
 * Gera um código de sala de 6 dígitos.
 * @returns {string}
 */
function generateRoomId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Escapa caracteres especiais para evitar XSS ao renderizar texto.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Embaralha array (Fisher-Yates).
 * @param {Array} arr
 * @returns {Array}
 */
function shuffle(arr) {
  const array = arr.slice();
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Baixa o arquivo CSV contendo resultados da partida.
 * @param {string} csv
 * @param {string} filename
 */
function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Formata milissegundos para mm:ss.s
 * @param {number} ms
 * @returns {string}
 */
function formatTime(ms) {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${seconds}`;
}

// =====================================================================
// Classe Game

class Game {
  /**
   * Construtor do jogo.
   * @param {Room} room Instância da sala.
   * @param {string} playerId ID do jogador atual.
   * @param {boolean} isHost Se o jogador é o host.
   */
  constructor(room, playerId, isHost) {
    this.room = room;
    this.playerId = playerId;
    this.isHost = isHost;
    this.questions = [];
    this.currentIndex = 0;
    this.timerId = null;
    this.timeRemaining = 0;
    this.perQuestion = 15000; // 15 s padrão
    this.startTime = 0;
    this.questionStartTs = 0;
    this.currentQuestion = null;
    this.answered = false;
    this.playerData = {};

    // Referências de elementos da UI
    this.lobbySection = document.getElementById('lobby');
    this.gameSection = document.getElementById('game');
    this.resultsSection = document.getElementById('results');
    this.questionProgress = document.getElementById('question-progress');
    this.timerEl = document.getElementById('timer');
    this.questionCard = document.getElementById('question-card');
    this.optionsContainer = document.getElementById('options');
    this.explanationEl = document.getElementById('explanation');
    this.scoreboardEl = document.getElementById('scoreboard');
    this.leaderboardEl = document.getElementById('leaderboard');
    this.exportCsvBtn = document.getElementById('export-csv-btn');
    this.winnerAnimation = document.getElementById('winner-animation');

    // Sons: tentar carregar MP3; caso falhe, usar WebAudio para gerar tom.
    // Embora existam arquivos de som, usaremos tons gerados por WebAudio para
    // tornar os feedbacks mais agradáveis e universais. Manter os arquivos
    // ainda permite pré-carregamento e compatibilidade futura.
    this.correctSound = new Audio('assets/sounds/correct.mp3');
    this.wrongSound = new Audio('assets/sounds/wrong.mp3');
    this.audioContext = null;

    // Armazena o último segundo sinalizado para a contagem regressiva. Usado
    // para tocar avisos apenas quando muda o segundo restante.
    this.prevSecond = null;
  }

  /**
   * Inicia a partida. Carrega perguntas, define cronômetro e configura listeners.
   * @param {number} questionCount Número de perguntas para a partida.
   */
  async start(questionCount) {
    // Carrega todas as perguntas do arquivo JSON e embaralha
    const res = await fetch('questions.json');
    const allQuestions = await res.json();
    this.questions = shuffle(allQuestions).slice(0, questionCount);

    // Atualiza no banco a lista de perguntas e reset do índice
    await update(ref(db, `rooms/${this.room.roomId}`), {
      status: 'in_progress',
      questionIndex: 0,
      settings: { questionCount, timePerQuestion: 15 }
    });
    // Armazena perguntas no audit para persistência (reduzida: apenas ids)
    await set(ref(db, `rooms/${this.room.roomId}/questionIds`), this.questions.map(q => q.id));

    this.currentIndex = 0;
    this.showQuestion();
  }

  /**
   * Exibe a pergunta atual e inicia o cronômetro.
   */
  showQuestion() {
    if (this.currentIndex >= this.questions.length) {
      this.finishGame();
      return;
    }
    this.currentQuestion = this.questions[this.currentIndex];
    this.answered = false;
    this.explanationEl.classList.add('hidden');
    // Atualiza UI
    this.questionCard.innerHTML = `<strong>${this.currentIndex + 1}/${this.questions.length}</strong>. ${escapeHtml(this.currentQuestion.pergunta)}`;
    this.optionsContainer.innerHTML = '';
    ['A','B','C','D'].forEach(letter => {
      const optionBtn = document.createElement('button');
      optionBtn.innerHTML = `<span>${letter}</span> ${escapeHtml(this.currentQuestion.alternativas[letter])}`;
      optionBtn.setAttribute('data-letter', letter);
      optionBtn.addEventListener('click', () => this.answerQuestion(letter, optionBtn));
      this.optionsContainer.appendChild(optionBtn);
    });
    // Progresso de perguntas
    const progDiv = document.createElement('div');
    progDiv.classList.add('progress');
    progDiv.style.width = `${(this.currentIndex / this.questions.length) * 100}%`;
    this.questionProgress.innerHTML = '';
    this.questionProgress.appendChild(progDiv);
    // Cronômetro
    this.startTimer();
  }

  /**
   * Inicia o cronômetro de 15s para a pergunta atual.
   */
  startTimer() {
    if (this.timerId) clearInterval(this.timerId);
    this.timeRemaining = this.perQuestion;
    this.startTime = performance.now();
    this.timerEl.textContent = `15.0s`;
    this.prevSecond = null;
    this.timerId = setInterval(() => {
      const elapsed = performance.now() - this.startTime;
      const remaining = Math.max(0, this.perQuestion - elapsed);
      // Atualiza display
      this.timerEl.textContent = `${(remaining / 1000).toFixed(1)}s`;
      // Toca aviso nos últimos 5 segundos a cada mudança de segundo
      const secondsLeft = Math.ceil(remaining / 1000);
      if (secondsLeft <= 5 && secondsLeft !== this.prevSecond) {
        this.playTimerWarning(secondsLeft);
        this.prevSecond = secondsLeft;
      }
      if (remaining <= 0) {
        clearInterval(this.timerId);
        this.lockAnswers();
      }
    }, 100);
  }

  /**
   * Bloqueia as respostas quando o tempo expira.
   */
  lockAnswers() {
    this.optionsContainer.querySelectorAll('button').forEach(btn => {
      btn.disabled = true;
    });
    if (!this.answered) {
      // Não respondeu => registrar resposta vazia
      this.registerAnswer(null, this.perQuestion);
      this.showExplanation();
    }
  }

  /**
   * Lida com a seleção de uma alternativa.
   * @param {string} letter Letra escolhida (A–D).
   * @param {HTMLButtonElement} btn Botão clicado.
   */
  answerQuestion(letter, btn) {
    if (this.answered) return; // evita duplo clique
    this.answered = true;
    clearInterval(this.timerId);
    const elapsedMs = performance.now() - this.startTime;
    this.registerAnswer(letter, elapsedMs);
    // Aplica estilo e toca som
    const correctLetter = this.currentQuestion.correta;
    this.optionsContainer.querySelectorAll('button').forEach(b => {
      const l = b.getAttribute('data-letter');
      if (l === correctLetter) {
        b.classList.add('correct');
      }
      if (l === letter && l !== correctLetter) {
        b.classList.add('wrong');
      }
      b.disabled = true;
    });
    if (letter === correctLetter) {
      this.playSound(true);
    } else {
      this.playSound(false);
    }
    this.showExplanation();
  }

  /**
   * Registra a resposta do jogador no banco.
   * @param {string|null} letter Letra respondida ou null se não respondeu.
   * @param {number} timeMs Tempo decorrido em milissegundos.
   */
  registerAnswer(letter, timeMs) {
    const isCorrect = letter === this.currentQuestion.correta;
    const answerData = {
      choice: letter || '',
      correct: isCorrect,
      timeMs: Math.round(timeMs)
    };
    const playerRef = ref(db, `rooms/${this.room.roomId}/players/${this.playerId}`);
    // Atualiza score e tempo total localmente antes de enviar
    get(playerRef).then(snap => {
      const data = snap.val() || {};
      const score = (data.score || 0) + (isCorrect ? 10 : 0);
      const totalTime = (data.totalResponseTimeMs || 0) + (isCorrect ? timeMs : 0);
      const answers = data.answers || {};
      answers[this.currentQuestion.id] = answerData;
      update(playerRef, {
        score,
        totalResponseTimeMs: totalTime,
        answers
      });
    });
  }

  /**
   * Exibe a explicação da questão e agenda próxima pergunta.
   */
  showExplanation() {
    this.explanationEl.textContent = `Explicação: ${this.currentQuestion.explicacao}`;
    this.explanationEl.classList.remove('hidden');
    setTimeout(() => {
      this.currentIndex++;
      this.showQuestion();
    }, 3000);
  }

  /**
   * Finaliza a partida e exibe a tela de resultados.
   */
  async finishGame() {
    await update(ref(db, `rooms/${this.room.roomId}`), { status: 'finished' });
    this.renderResults();
  }

  /**
   * Atualiza o scoreboard em tempo real.
   * Esta função é chamada sempre que há mudanças em players.
   * @param {Object} players
   */
  updateScoreboard(players) {
    // Converte para array e ordena
    const list = Object.entries(players || {}).map(([id, p]) => {
      return {
        id,
        name: p.name,
        unidade: p.unidade,
        score: p.score || 0,
        totalResponseTimeMs: p.totalResponseTimeMs || 0
      };
    });
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.totalResponseTimeMs - b.totalResponseTimeMs;
    });
    // Renderiza tabela
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Jogador</th><th>Unidade</th><th>Pontos</th><th>Tempo Total</th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    list.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.unidade)}</td><td>${p.score}</td><td>${formatTime(p.totalResponseTimeMs)}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    this.scoreboardEl.innerHTML = '';
    this.scoreboardEl.appendChild(table);
  }

  /**
   * Gera a tela de resultados (ranking final) e animação.
   */
  renderResults() {
    this.gameSection.classList.add('hidden');
    this.lobbySection.classList.add('hidden');
    this.resultsSection.classList.remove('hidden');
    // Busca dados de players para ranking
    get(ref(db, `rooms/${this.room.roomId}/players`)).then(snapshot => {
      const players = snapshot.val() || {};
      const list = Object.entries(players).map(([id, p]) => {
        return {
          id,
          name: p.name,
          unidade: p.unidade,
          score: p.score || 0,
          totalResponseTimeMs: p.totalResponseTimeMs || 0
        };
      });
      list.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.totalResponseTimeMs - b.totalResponseTimeMs;
      });
      // Monta tabela final
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Posição</th><th>Jogador</th><th>Unidade</th><th>Pontos</th><th>Tempo Total</th></tr>';
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      list.forEach((p, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${index + 1}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.unidade)}</td><td>${p.score}</td><td>${formatTime(p.totalResponseTimeMs)}</td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      // Oculta o ranking inicialmente. Ele será exibido após a animação do vencedor.
      this.leaderboardEl.innerHTML = '';
      this.leaderboardEl.classList.add('hidden');
      // Exibe animação de vencedor e depois mostra a tabela
      if (list.length > 0) {
        const winner = list[0];
        this.showWinnerAnimation(winner.name);
      }
      // Após 3 segundos, exibe o ranking completo
      setTimeout(() => {
        this.leaderboardEl.appendChild(table);
        this.leaderboardEl.classList.remove('hidden');
      }, 3000);
    });
  }

  /**
   * Cria animação de confetes e destaque do vencedor.
   * @param {string} winnerName
   */
  showWinnerAnimation(winnerName) {
    this.winnerAnimation.innerHTML = '';
    // Limpa qualquer conteúdo existente
    // Cria troféu e título do vencedor
    const trophy = document.createElement('img');
    trophy.src = 'assets/img/trophy.svg';
    trophy.alt = 'Troféu do vencedor';
    trophy.className = 'trophy-icon';
    this.winnerAnimation.appendChild(trophy);

    const title = document.createElement('h2');
    title.textContent = `Parabéns, ${winnerName}!`;
    title.style.textAlign = 'center';
    title.style.color = 'var(--color-primary)';
    this.winnerAnimation.appendChild(title);

    // Gera confetes e fogos com quantidades maiores para uma celebração
    const colors = ['#FFC107', '#1976D2', '#4CAF50', '#E53935', '#FFD740', '#00BCD4'];
    const confettiCount = 150;
    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement('div');
      confetti.classList.add('confetti');
      confetti.style.left = Math.random() * 100 + '%';
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.animationDuration = (2 + Math.random() * 3) + 's';
      confetti.style.opacity = (0.7 + Math.random() * 0.3).toString();
      this.winnerAnimation.appendChild(confetti);
    }

    // Adiciona alguns fogos de artifício ao redor do troféu. Cada fogo é
    // um círculo radial que expande e desaparece. Escolhemos posições
    // aleatórias dentro do contêiner de animação para dar sensação de
    // explosão. O CSS `.firework` define a animação de expansão.
    const fireworkCount = 8;
    for (let i = 0; i < fireworkCount; i++) {
      const fw = document.createElement('div');
      fw.classList.add('firework');
      // Distribui os fogos ao redor do centro (troféu) com valores aleatórios
      const offsetX = (Math.random() * 60) - 30; // -30% a 30%
      const offsetY = (Math.random() * 40) - 20; // -20% a 20%
      // Posiciona relativamente ao centro do contêiner
      fw.style.left = `calc(50% + ${offsetX}% )`;
      fw.style.top = `calc(50% + ${offsetY}% )`;
      this.winnerAnimation.appendChild(fw);
    }
  }

  /**
   * Reproduz um som de feedback ao responder uma questão. Para tornar o
   * feedback mais agradável, utiliza dois osciladores para criar um
   * acorde simples em vez de um beep único. O som é breve e suave.
   * @param {boolean} correct Indica se a resposta foi correta.
   */
  playSound(correct) {
    /*
     * Em vez de apenas um acorde, tocamos uma fanfarra curta para respostas
     * corretas e uma sequência descendente mais dramática para respostas
     * erradas. A sequência de acerto é uma série de notas ascendentes
     * (C5, E5, G5, B5, C6, E6) que criam uma sensação de comemoração. A
     * sequência de erro utiliza notas menores e descendentes (G4, Eb4,
     * C4, G3, E3) para transmitir decepção. Cada nota dura 0,18 s e
     * inicia com um atraso de 0,12 s em relação à anterior. O volume
     * é ajustado para ser confortável ao ouvido. Caso o contexto de
     * áudio ainda não exista, ele é criado.
     */
    const sequences = correct
      ? [523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51] // C5, E5, G5, B5, C6, E6
      : [392.00, 311.13, 261.63, 196.00, 164.81];          // G4, Eb4, C4, G3, E3
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = this.audioContext;
    sequences.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = correct ? 0.22 : 0.25;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const startTime = ctx.currentTime + index * 0.12;
      osc.start(startTime);
      osc.stop(startTime + 0.18);
    });
  }

  /**
   * Toca um aviso sonoro quando o tempo da pergunta está no final. O
   * parâmetro seconds indica quantos segundos restam e pode ser usado
   * para variar o tom. Quando restam 2 segundos ou menos, o tom fica
   * mais agudo para aumentar a urgência.
   * @param {number} seconds Restantes (inteiro)
   */
  playTimerWarning(seconds) {
    /*
     * Esta função toca uma sequência temática durante os últimos segundos
     * do cronômetro. Cada segundo restante possui uma melodia própria,
     * criando um clima de contagem regressiva. Nas contagens mais altas
     * (3–5 segundos) tocamos acordes menores ascendentes (F, G, A), e
     * nos dois últimos segundos usamos notas bem agudas para aumentar
     * a tensão. Cada nota é iniciada com pequeno atraso para produzir
     * um efeito arpejado.
     */
    const melodies = {
      5: [349.23, 392.00, 440.00],        // F4, G4, A4
      4: [392.00, 493.88, 587.33],        // G4, B4, D5
      3: [440.00, 554.37, 659.25],        // A4, C#5, E5
      2: [659.25, 783.99],                // E5, G5
      1: [880.00, 987.77, 1046.50]        // A5, B5, C6
    };
    const freqs = melodies[seconds] || [523.25, 659.25, 783.99];
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = this.audioContext;
    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    gain.connect(ctx.destination);
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      osc.connect(gain);
      const startTime = ctx.currentTime + idx * 0.1;
      osc.start(startTime);
      osc.stop(startTime + 0.35);
    });
  }

  /**
   * Exporta resultados em CSV.
   */
  exportCsv() {
    get(ref(db, `rooms/${this.room.roomId}/players`)).then(snapshot => {
      const players = snapshot.val() || {};
      const rows = [];
      const dateUTC = new Date().toISOString();
      Object.entries(players).forEach(([id, p]) => {
        const answered = p.answers ? Object.keys(p.answers).length : 0;
        const corrects = p.answers
          ? Object.values(p.answers).filter(a => a.correct).length
          : 0;
        const avgTime = corrects > 0 ? p.totalResponseTimeMs / corrects : 0;
        rows.push([
          this.room.roomId,
          dateUTC,
          p.name,
          p.unidade,
          p.score || 0,
          p.totalResponseTimeMs || 0,
          answered,
          corrects,
          Math.round(avgTime)
        ]);
      });
      const header = 'roomId,dataHoraUTC,nome,unidade,pontuacao,tempoTotalMs,perguntasRespondidas,acertos,tempoMedioMs';
      const csv = [header, ...rows.map(r => r.join(','))].join('\n');
      downloadCsv(csv, `resultados_${this.room.roomId}_${Date.now()}.csv`);
    });
  }
}

// =====================================================================
// Classe Room

class Room {
  constructor(roomId) {
    this.roomId = roomId;
    this.roomRef = ref(db, `rooms/${roomId}`);
  }
  /** Cria uma nova sala no banco. */
  static async create(hostId, settings) {
    const roomId = generateRoomId();
    const roomRef = ref(db, `rooms/${roomId}`);
    await set(roomRef, {
      status: 'lobby',
      createdAt: serverTimestamp(),
      hostId,
      settings,
      questionIndex: 0
    });
    return new Room(roomId);
  }
  /** Adiciona jogador à sala. */
  async addPlayer(playerId, name, unidade) {
    const playerRef = ref(db, `rooms/${this.roomId}/players/${playerId}`);
    await set(playerRef, {
      name,
      unidade,
      joinedAt: serverTimestamp(),
      score: 0,
      totalResponseTimeMs: 0
    });
  }
  /** Remove jogador da sala. */
  async removePlayer(playerId) {
    await remove(ref(db, `rooms/${this.roomId}/players/${playerId}`));
  }
}

// =====================================================================
// UI e inicialização

// Elementos de lobby
const createRoomBtn = document.getElementById('create-room-btn');
const roomDetails = document.getElementById('room-details');
const roomCodeDisplay = document.getElementById('room-code-display');
const startGameBtn = document.getElementById('start-game-btn');
const questionCountSelect = document.getElementById('question-count');
const playersListEl = document.getElementById('players-list');
const joinForm = document.getElementById('join-form');
const rematchBtn = document.getElementById('rematch-btn');
const newRoomBtn = document.getElementById('new-room-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');

// -------------------------------------------------------------------
//  Fluxo de exibição no lobby
//
// As cartas de criação de sala e de ingresso na sala são exibidas de
// acordo com o contexto. Por padrão, apenas a criação de sala aparece.
// Quando o usuário acessa a página com ?room=<id> na URL, a carta de
// ingresso é exibida e a de criação é ocultada. O host também não vê
// o formulário de ingresso após criar a sala.
const createRoomCard = document.getElementById('create-room-card');
const joinRoomCard = document.getElementById('join-room-card');
const joinRoomCodeInput = document.getElementById('join-room-code');

// O botão de iniciar partida deve ficar oculto até que o host crie
// a sala. Para jogadores, esse botão permanecerá oculto.
startGameBtn.classList.add('hidden');

// Estado global
let currentRoom = null;
let currentGame = null;
let currentPlayerId = null;
let isHost = false;

// -------------------------------------------------------------------
//  Manipula a exibição de cartões com base no parâmetro da URL
//
// Se a URL contiver ?room=<código>, oculta a carta de criação de sala e
// exibe a carta de ingresso, preenchendo o campo de código
// automaticamente. Caso contrário, mantém a criação de sala visível
// (join card permanecerá oculto por padrão). Essa função é executada
// imediatamente para ajustar o layout antes das ações do usuário.
(() => {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');
  if (roomParam) {
    // Visitante com link: mostrar formulário de ingresso
    createRoomCard.classList.add('hidden');
    joinRoomCard.classList.remove('hidden');
    if (joinRoomCodeInput) {
      joinRoomCodeInput.value = roomParam;
    }
  }
})();

// Autentica anonimamente e inicializa handlers
signInAnonymously(auth).catch(err => console.error(err));
onAuthStateChanged(auth, user => {
  if (user) {
    currentPlayerId = user.uid;
    // Tenta recuperar sala e jogador do localStorage (reconexão)
    const saved = localStorage.getItem('preventionQuiz');
    if (saved) {
      const { roomId, playerId } = JSON.parse(saved);
      if (playerId === currentPlayerId) {
        // Reconecta ao quarto existente
        joinExistingRoom(roomId, false);
      }
    }
  }
});

/**
 * Cria nova sala quando o host clica no botão.
 */
createRoomBtn.addEventListener('click', async () => {
  isHost = true;
  // Cria sala com definições iniciais
  currentRoom = await Room.create(currentPlayerId, {
    questionCount: parseInt(questionCountSelect.value, 10),
    timePerQuestion: 15
  });
  roomCodeDisplay.textContent = currentRoom.roomId;
  roomDetails.classList.remove('hidden');
  // Gera QR Code do link para ingressar e atualiza o link textual
  // Constrói o link manualmente para evitar que o template literal seja quebrado
  // em múltiplas linhas durante a minificação/empacotamento. Usar concatenação
  // simples garante que o código e a query apareçam corretamente.
  const joinUrl =
    window.location.origin +
    window.location.pathname +
    '?room=' +
    currentRoom.roomId;
  // Preenche o elemento de link para permitir que o host compartilhe o endereço
  const joinLinkEl = document.getElementById('join-link');
  if (joinLinkEl) {
    joinLinkEl.href = joinUrl;
    joinLinkEl.textContent = joinUrl;
  }
  // Renderiza o QR Code correspondente ao link. Antes de gerar um novo
  // código, limpe qualquer conteúdo existente no contêiner para evitar
  // sobreposições. Em alguns ambientes (como GitHub Pages) o construtor
  // `QRCode` pode não anexar automaticamente o canvas quando chamado com
  // opções, portanto utilizamos o padrão "instanciar + makeCode" para
  // garantir que a imagem seja gerada. Caso a biblioteca não esteja
  // disponível por algum motivo, mantemos apenas o link textual.
  const qrContainer = document.getElementById('qrcode');
  if (qrContainer) {
    qrContainer.innerHTML = '';
    if (typeof QRCode === 'function') {
      try {
        const qr = new QRCode(qrContainer, {
          width: 128,
          height: 128,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
        // Alguns builds exigem a chamada explícita de makeCode() para
        // desenhar o QR Code. Caso contrário, o construtor já utiliza
        // a opção `text` para gerar o código.
        if (typeof qr.makeCode === 'function') {
          qr.makeCode(joinUrl);
        }
      } catch (err) {
        // Se ocorrer qualquer erro na geração com a biblioteca local,
        // utilize um serviço externo para gerar a imagem do QR Code.
        console.error('Erro ao gerar QR Code:', err);
        qrContainer.innerHTML =
          '<img src="https://api.qrserver.com/v1/create-qr-code/?data=' +
          encodeURIComponent(joinUrl) +
          '&size=128x128" alt="QR Code" />';
      }
    } else {
      // Fallback: se a biblioteca não existir, gera imagem QR via API pública.
      console.warn('Biblioteca QRCode não encontrada');
      qrContainer.innerHTML =
        '<img src="https://api.qrserver.com/v1/create-qr-code/?data=' +
        encodeURIComponent(joinUrl) +
        '&size=128x128" alt="QR Code" />';
    }
  }
  // Adiciona host como player
  await currentRoom.addPlayer(currentPlayerId, 'Host', '');
  localStorage.setItem('preventionQuiz', JSON.stringify({ roomId: currentRoom.roomId, playerId: currentPlayerId }));
  // Observa mudanças de jogadores
  onValue(ref(db, `rooms/${currentRoom.roomId}/players`), snapshot => {
    const players = snapshot.val() || {};
    playersListEl.innerHTML = '';
    Object.values(players).forEach(p => {
      const div = document.createElement('div');
      div.textContent = `${p.name} (${p.unidade})`;
      playersListEl.appendChild(div);
    });
  });

  // Oculta o formulário de ingresso (host não deve ver) e exibe botão de iniciar
  joinRoomCard.classList.add('hidden');
  startGameBtn.classList.remove('hidden');

  // Oculta também o botão de criar sala após a criação para evitar que o
  // host crie múltiplas salas acidentalmente. O botão será exibido
  // novamente caso a página seja recarregada ou em uma nova visita.
  createRoomBtn.classList.add('hidden');
});

/**
 * Inicia o jogo quando o host seleciona iniciar.
 */
startGameBtn.addEventListener('click', async () => {
  if (!currentRoom) return;
  currentGame = new Game(currentRoom, currentPlayerId, true);
  // Esconde lobby e mostra jogo
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  await currentGame.start(parseInt(questionCountSelect.value, 10));
  // Escuta scoreboard
  onValue(ref(db, `rooms/${currentRoom.roomId}/players`), snapshot => {
    currentGame.updateScoreboard(snapshot.val());
  });
});

/**
 * Tratamento de submissão do formulário de entrada na sala.
 */
joinForm.addEventListener('submit', async e => {
  e.preventDefault();
  const roomId = joinForm.querySelector('#join-room-code').value.trim();
  const name = joinForm.querySelector('#player-name').value.trim();
  const unit = joinForm.querySelector('#player-unit').value.trim();
  if (!roomId || !name || !unit) return;
  // Sanitize
  const safeName = escapeHtml(name);
  const safeUnit = escapeHtml(unit);
  await joinExistingRoom(roomId, true, safeName, safeUnit);
});

/**
 * Função utilitária para juntar-se a uma sala existente.
 * @param {string} roomId
 * @param {boolean} registerPlayer se deve registrar o jogador na sala
 * @param {string} [name]
 * @param {string} [unit]
 */
async function joinExistingRoom(roomId, registerPlayer = false, name = '', unit = '') {
  // Instancia a sala localmente para que possamos interagir com o banco
  currentRoom = new Room(roomId);
  // Verifica se a sala existe no Realtime Database
  const snap = await get(ref(db, `rooms/${roomId}`));
  if (!snap.exists()) {
    alert('Sala não encontrada');
    return;
  }
  const roomData = snap.val();
  // Verifica se o usuário é host comparando hostId com o UID atual
  isHost = roomData.hostId === currentPlayerId;
  // Se deve registrar o jogador, adiciona-o na lista de players da sala
  if (registerPlayer) {
    await currentRoom.addPlayer(currentPlayerId, name, unit);
    // Armazena no localStorage para permitir reconexão
    localStorage.setItem('preventionQuiz', JSON.stringify({ roomId, playerId: currentPlayerId }));
  }

  // Ajuste imediato do lobby baseado no papel do usuário (host ou jogador)
  if (isHost) {
    // O host não vê o formulário de entrada e pode iniciar a partida
    joinRoomCard.classList.add('hidden');
    // Exibe detalhes da sala (código, QR/link e lista) e botão de iniciar
    roomDetails.classList.remove('hidden');
    startGameBtn.classList.remove('hidden');
    // Oculta botão de criar nova sala para evitar múltiplas salas
    createRoomBtn.classList.add('hidden');
    // Atualiza código e link de convite
    roomCodeDisplay.textContent = roomId;
    const joinUrl = window.location.origin + window.location.pathname + '?room=' + roomId;
    const joinLinkEl = document.getElementById('join-link');
    if (joinLinkEl) {
      joinLinkEl.href = joinUrl;
      joinLinkEl.textContent = joinUrl;
    }
  } else {
    // Jogador: mostra cartão da sala com código e link para aguardar host
    // Oculta criação de sala e formulário de ingresso
    createRoomBtn.classList.add('hidden');
    joinRoomCard.classList.add('hidden');
    // Reutiliza o cartão de criação para exibir código, link e lista de jogadores
    createRoomCard.classList.remove('hidden');
    roomDetails.classList.remove('hidden');
    // Oculta o botão de iniciar (apenas host vê)
    startGameBtn.classList.add('hidden');
    // Define código e link para a sala
    roomCodeDisplay.textContent = roomId;
    const joinUrl = window.location.origin + window.location.pathname + '?room=' + roomId;
    const joinLinkEl = document.getElementById('join-link');
    if (joinLinkEl) {
      joinLinkEl.href = joinUrl;
      joinLinkEl.textContent = joinUrl;
    }
    // Mensagem inicial até que jogadores sejam listados
    playersListEl.innerHTML = '<p>Aguardando início da partida…</p>';
  }

  // Observa mudanças de status da sala para iniciar/finalizar a partida
  onValue(ref(db, `rooms/${roomId}/status`), snapshot => {
    const status = snapshot.val();
    if (status === 'in_progress' && !currentGame) {
      // Quando o jogo inicia, troca para a seção de perguntas
      document.getElementById('lobby').classList.add('hidden');
      document.getElementById('game').classList.remove('hidden');
      currentGame = new Game(currentRoom, currentPlayerId, isHost);
      // Passa a observar placar em tempo real para atualização durante o jogo
      onValue(ref(db, `rooms/${roomId}/players`), snapPlayers => {
        currentGame.updateScoreboard(snapPlayers.val());
      });
    }
    if (status === 'finished' && currentGame) {
      currentGame.renderResults();
    }
  });

  // Observa lista de jogadores enquanto no lobby (antes de iniciar o jogo)
  onValue(ref(db, `rooms/${roomId}/players`), snapPlayers => {
    const players = snapPlayers.val() || {};
    // Atualiza a lista de jogadores apenas para participantes (não host)
    if (!isHost) {
      playersListEl.innerHTML = '';
      Object.values(players).forEach(p => {
        const row = document.createElement('div');
        row.textContent = `${p.name} (${p.unidade})`;
        playersListEl.appendChild(row);
      });
    }
  });
}

// Botões de resultados
exportCsvBtn.addEventListener('click', () => {
  currentGame && currentGame.exportCsv();
});
rematchBtn.addEventListener('click', () => {
  // Reinicia partida com mesmos jogadores
  if (!isHost) return;
  location.reload();
});
newRoomBtn.addEventListener('click', () => {
  location.reload();
});