const STEP_LENGTH = 1;
const CELL_SIZE = 10;
const BORDER_WIDTH = 2;
const MAX_FONT_SIZE = 500;
const MAX_ELECTRONS = 30;
const CELL_DISTANCE = CELL_SIZE + BORDER_WIDTH;

// shorter for brighter paint
// be careful of performance issue
const CELL_REPAINT_INTERVAL = [
300, // from
500 // to
];

const BG_COLOR = '#1d2227';
const BORDER_COLOR = '#13191f';
const CELL_HIGHLIGHT = '#328bf6';
const ELECTRON_COLOR = '#00b07c';
const FONT_COLOR = '#ff5353';

const FONT_FAMILY = 'Helvetica, Arial, "Hiragino Sans GB", "Microsoft YaHei", "WenQuan Yi Micro Hei", sans-serif';

const DPR = window.devicePixelRatio || 1;

const ACTIVE_ELECTRONS = [];
const PINNED_CELLS = [];

const MOVE_TRAILS = [
[0, 1], // down
[0, -1], // up
[1, 0], // right
[-1, 0] // left
].map(([x, y]) => [x * CELL_DISTANCE, y * CELL_DISTANCE]);

const END_POINTS_OFFSET = [
[0, 0], // left top
[0, 1], // left bottom
[1, 0], // right top
[1, 1] // right bottom
].map(([x, y]) => [
x * CELL_DISTANCE - BORDER_WIDTH / 2,
y * CELL_DISTANCE - BORDER_WIDTH / 2]);


class FullscreenCanvas {
  constructor(disableScale = false) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    this.canvas = canvas;
    this.context = context;
    this.disableScale = disableScale;

    this.resizeHandlers = [];
    this.handleResize = _.debounce(this.handleResize.bind(this), 100);

    this.adjust();

    window.addEventListener('resize', this.handleResize);
  }

  adjust() {
    const {
      canvas,
      context,
      disableScale } =
    this;

    const {
      innerWidth,
      innerHeight } =
    window;

    this.width = innerWidth;
    this.height = innerHeight;

    const scale = disableScale ? 1 : DPR;

    this.realWidth = canvas.width = innerWidth * scale;
    this.realHeight = canvas.height = innerHeight * scale;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;

    context.scale(scale, scale);
  }

  clear() {
    const { context } = this;

    context.clearRect(0, 0, this.width, this.height);
  }

  makeCallback(fn) {
    fn(this.context, this);
  }

  blendBackground(background, opacity = 0.05) {
    return this.paint((ctx, { realWidth, realHeight, width, height }) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = opacity;

      ctx.drawImage(background, 0, 0, realWidth, realHeight, 0, 0, width, height);
    });
  }

  paint(fn) {
    if (!_.isFunction(fn)) return;

    const { context } = this;

    context.save();

    this.makeCallback(fn);

    context.restore();

    return this;
  }

  repaint(fn) {
    if (!_.isFunction(fn)) return;

    this.clear();

    return this.paint(fn);
  }

  onResize(fn) {
    if (!_.isFunction(fn)) return;

    this.resizeHandlers.push(fn);
  }

  handleResize() {
    const { resizeHandlers } = this;

    if (!resizeHandlers.length) return;

    this.adjust();

    resizeHandlers.forEach(this.makeCallback.bind(this));
  }

  renderIntoView(target = document.body) {
    const { canvas } = this;

    this.container = target;

    canvas.style.position = 'absolute';
    canvas.style.left = '0px';
    canvas.style.top = '0px';

    target.appendChild(canvas);
  }

  remove() {
    if (!this.container) return;

    try {
      window.removeEventListener('resize', this.handleResize);
      this.container.removeChild(this.canvas);
    } catch (e) {}
  }}


class Electron {
  constructor(
  x = 0,
  y = 0,
  {
    lifeTime = 3 * 1e3,
    speed = STEP_LENGTH,
    color = ELECTRON_COLOR } =
  {})
  {
    this.lifeTime = lifeTime;
    this.expireAt = Date.now() + lifeTime;

    this.speed = speed;
    this.color = color;

    this.radius = BORDER_WIDTH / 2;
    this.current = [x, y];
    this.visited = {};
    this.setDest(this.randomPath());
  }

  randomPath() {
    const {
      current: [x, y] } =
    this;

    const { length } = MOVE_TRAILS;

    const [deltaX, deltaY] = MOVE_TRAILS[_.random(length - 1)];

    return [
    x + deltaX,
    y + deltaY];

  }

  composeCoord(coord) {
    return coord.join(',');
  }

  hasVisited(dest) {
    const key = this.composeCoord(dest);

    return this.visited[key];
  }

  setDest(dest) {
    this.destination = dest;
    this.visited[this.composeCoord(dest)] = true;
  }

  next() {
    let {
      speed,
      current,
      destination } =
    this;

    if (Math.abs(current[0] - destination[0]) <= speed / 2 &&
    Math.abs(current[1] - destination[1]) <= speed / 2)
    {
      destination = this.randomPath();

      let tryCnt = 1;
      const maxAttempt = 4;

      while (this.hasVisited(destination) && tryCnt <= maxAttempt) {
        tryCnt++;
        destination = this.randomPath();
      }

      this.setDest(destination);
    }

    const deltaX = destination[0] - current[0];
    const deltaY = destination[1] - current[1];

    if (deltaX) {
      current[0] += deltaX / Math.abs(deltaX) * speed;
    }

    if (deltaY) {
      current[1] += deltaY / Math.abs(deltaY) * speed;
    }

    return [...this.current];
  }

  paintNextTo(layer = new FullscreenCanvas()) {
    const {
      radius,
      color,
      expireAt,
      lifeTime } =
    this;

    const [x, y] = this.next();

    layer.paint(ctx => {
      ctx.globalAlpha = Math.max(0, expireAt - Date.now()) / lifeTime;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = radius * 5;
      ctx.globalCompositeOperation = 'lighter';

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.closePath();

      ctx.fill();
    });
  }}


class Cell {
  constructor(
  row = 0,
  col = 0,
  {
    electronCount = _.random(1, 4),
    background = ELECTRON_COLOR,
    forceElectrons = false,
    electronOptions = {} } =
  {})
  {
    this.background = background;
    this.electronOptions = electronOptions;
    this.forceElectrons = forceElectrons;
    this.electronCount = Math.min(electronCount, 4);

    this.startY = row * CELL_DISTANCE;
    this.startX = col * CELL_DISTANCE;
  }

  delay(ms = 0) {
    this.pin(ms * 1.5);
    this.nextUpdate = Date.now() + ms;
  }

  pin(lifeTime = -1 >>> 1) {
    this.expireAt = Date.now() + lifeTime;

    PINNED_CELLS.push(this);
  }

  scheduleUpdate(
  t1 = CELL_REPAINT_INTERVAL[0],
  t2 = CELL_REPAINT_INTERVAL[1])
  {
    this.nextUpdate = Date.now() + _.random(t1, t2);
  }

  paintNextTo(layer = new FullscreenCanvas()) {
    const {
      startX,
      startY,
      background,
      nextUpdate } =
    this;

    if (nextUpdate && Date.now() < nextUpdate) return;

    this.scheduleUpdate();
    this.createElectrons();

    layer.paint(ctx => {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = background;
      ctx.fillRect(startX, startY, CELL_SIZE, CELL_SIZE);
    });
  }

  popRandom(arr = []) {
    const ramIdx = _.random(arr.length - 1);

    return arr.splice(ramIdx, 1)[0];
  }

  createElectrons() {
    const {
      startX,
      startY,
      electronCount,
      electronOptions,
      forceElectrons } =
    this;

    if (!electronCount) return;

    const endpoints = [...END_POINTS_OFFSET];

    const max = forceElectrons ? electronCount : Math.min(electronCount, MAX_ELECTRONS - ACTIVE_ELECTRONS.length);

    for (let i = 0; i < max; i++) {
      const [offsetX, offsetY] = this.popRandom(endpoints);

      ACTIVE_ELECTRONS.push(new Electron(
      startX + offsetX,
      startY + offsetY,
      electronOptions));

    }
  }}


const bgLayer = new FullscreenCanvas();
const mainLayer = new FullscreenCanvas();
const shapeLayer = new FullscreenCanvas(true);

function stripOld(limit = 1000) {
  const now = Date.now();

  for (let i = 0, max = ACTIVE_ELECTRONS.length; i < max; i++) {
    const e = ACTIVE_ELECTRONS[i];

    if (e.expireAt - now < limit) {
      ACTIVE_ELECTRONS.splice(i, 1);

      i--;
      max--;
    }
  }
}

function createRandomCell(options = {}) {
  if (ACTIVE_ELECTRONS.length >= MAX_ELECTRONS) return;

  const { width, height } = mainLayer;

  const cell = new Cell(
  _.random(height / CELL_DISTANCE),
  _.random(width / CELL_DISTANCE),
  options);


  cell.paintNextTo(mainLayer);
}

function drawGrid() {
  bgLayer.paint((ctx, { width, height }) => {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = BORDER_COLOR;

    // horizontal lines
    for (let h = CELL_SIZE; h < height; h += CELL_DISTANCE) {
      ctx.fillRect(0, h, width, BORDER_WIDTH);
    }

    // vertical lines
    for (let w = CELL_SIZE; w < width; w += CELL_DISTANCE) {
      ctx.fillRect(w, 0, BORDER_WIDTH, height);
    }
  });
}

function iterateItemsIn(list) {
  const now = Date.now();

  for (let i = 0, max = list.length; i < max; i++) {
    const item = list[i];

    if (now >= item.expireAt) {
      list.splice(i, 1);
      i--;
      max--;
    } else {
      item.paintNextTo(mainLayer);
    }
  }
}

function drawItems() {
  iterateItemsIn(PINNED_CELLS);
  iterateItemsIn(ACTIVE_ELECTRONS);
}

let nextRandomAt;

function activateRandom() {
  const now = Date.now();

  if (now < nextRandomAt) {
    return;
  }

  nextRandomAt = now + _.random(300, 1000);

  createRandomCell();
}

function handlePointer() {
  let lastCell = [];
  let touchRecords = {};

  function isSameCell(i, j) {
    const [li, lj] = lastCell;

    lastCell = [i, j];

    return i === li && j === lj;
  };

  function print(isMove, { clientX, clientY }) {
    const i = Math.floor(clientY / CELL_DISTANCE);
    const j = Math.floor(clientX / CELL_DISTANCE);

    if (isMove && isSameCell(i, j)) {
      return;
    }

    const cell = new Cell(i, j, {
      background: CELL_HIGHLIGHT,
      forceElectrons: true,
      electronCount: isMove ? 2 : 4,
      electronOptions: {
        speed: 3,
        lifeTime: isMove ? 500 : 1000,
        color: CELL_HIGHLIGHT } });



    cell.paintNextTo(mainLayer);
  }

  const handlers = {
    touchend({ changedTouches }) {
      if (changedTouches) {
        Array.from(changedTouches).forEach(({ identifier }) => {
          delete touchRecords[identifier];
        });
      } else {
        touchRecords = {};
      }
    } };


  function filterTouches(touchList) {
    return Array.from(touchList).filter(({ identifier, clientX, clientY }) => {
      const rec = touchRecords[identifier];
      touchRecords[identifier] = { clientX, clientY };

      return !rec || clientX !== rec.clientX || clientY !== rec.clientY;
    });
  }

  [
  'mousedown',
  'touchstart',
  'mousemove',
  'touchmove'].
  forEach(name => {
    const isMove = /move/.test(name);
    const isTouch = /touch/.test(name);

    const fn = print.bind(null, isMove);

    handlers[name] = function handler(evt) {
      if (isTouch) {
        filterTouches(evt.touches).forEach(fn);
      } else {
        fn(evt);
      }
    };
  });

  const events = Object.keys(handlers);

  events.forEach(name => {
    document.addEventListener(name, handlers[name]);
  });

  return function unbind() {
    events.forEach(name => {
      document.removeEventListener(name, handlers[name]);
    });
  };
}

function prepaint() {
  drawGrid();

  mainLayer.paint((ctx, { width, height }) => {
    // composite with rgba(255,255,255,255) to clear trails
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  });

  mainLayer.blendBackground(bgLayer.canvas, 0.9);
}

function render() {
  mainLayer.blendBackground(bgLayer.canvas);

  drawItems();
  activateRandom();

  shape.renderID = requestAnimationFrame(render);
}

const shape = {
  lastText: '',
  lastMatrix: null,
  renderID: undefined,
  isAlive: false,

  get electronOptions() {
    return {
      speed: 2,
      color: FONT_COLOR,
      lifeTime: _.random(300, 500) };

  },

  get cellOptions() {
    return {
      background: FONT_COLOR,
      electronCount: _.random(1, 4),
      electronOptions: this.electronOptions };

  },

  get explodeOptions() {
    return Object.assign(this.cellOptions, {
      electronOptions: Object.assign(this.electronOptions, {
        lifeTime: _.random(500, 1500) }) });


  },

  init(container = document.body) {
    if (this.isAlive) {
      return;
    }

    bgLayer.onResize(drawGrid);
    mainLayer.onResize(prepaint);

    mainLayer.renderIntoView(container);

    shapeLayer.onResize(() => {
      if (this.lastText) {
        this.print(this.lastText);
      }
    });

    prepaint();
    render();

    this.unbindEvents = handlePointer();
    this.isAlive = true;
  },

  clear() {
    const {
      lastMatrix } =
    this;

    this.lastText = '';
    this.lastMatrix = null;
    PINNED_CELLS.length = 0;

    if (lastMatrix) {
      this.explode(lastMatrix);
    }
  },

  destroy() {
    if (!this.isAlive) {
      return;
    }

    bgLayer.remove();
    mainLayer.remove();
    shapeLayer.remove();

    this.unbindEvents();

    cancelAnimationFrame(this.renderID);

    ACTIVE_ELECTRONS.length = PINNED_CELLS.length = 0;
    this.lastMatrix = null;
    this.lastText = '';
    this.isAlive = false;
  },

  getTextMatrix(
  text,
  {
    fontWeight = 'bold',
    fontFamily = FONT_FAMILY } =
  {})
  {
    const {
      width,
      height } =
    shapeLayer;

    shapeLayer.repaint(ctx => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${fontWeight} ${MAX_FONT_SIZE}px ${fontFamily}`;

      const scale = width / ctx.measureText(text).width;
      const fontSize = Math.min(MAX_FONT_SIZE, MAX_FONT_SIZE * scale * 0.8);

      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

      ctx.fillText(text, width / 2, height / 2);
    });

    const pixels = shapeLayer.context.getImageData(0, 0, width, height).data;
    const matrix = [];

    for (let i = 0; i < height; i += CELL_DISTANCE) {
      for (let j = 0; j < width; j += CELL_DISTANCE) {
        const alpha = pixels[(j + i * width) * 4 + 3];

        if (alpha > 0) {
          matrix.push([
          Math.floor(i / CELL_DISTANCE),
          Math.floor(j / CELL_DISTANCE)]);

        }
      }
    }

    return matrix;
  },

  print(text, options) {
    const isBlank = !!this.lastText;

    this.clear();

    if (text !== 0 && !text) {
      if (isBlank) {
        // release
        this.spiral({
          reverse: true,
          lifeTime: 500,
          electronCount: 2 });

      }

      return;
    }

    this.spiral();

    this.lastText = text;

    const matrix = this.lastMatrix = _.shuffle(this.getTextMatrix(text, options));

    matrix.forEach(([i, j]) => {
      const cell = new Cell(i, j, this.cellOptions);

      cell.scheduleUpdate(200);
      cell.pin();
    });
  },

  spiral({
    radius,
    increment = 0,
    reverse = false,
    lifeTime = 250,
    electronCount = 1,
    forceElectrons = true } =
  {}) {
    const {
      width,
      height } =
    mainLayer;

    const cols = Math.floor(width / CELL_DISTANCE);
    const rows = Math.floor(height / CELL_DISTANCE);

    const ox = Math.floor(cols / 2);
    const oy = Math.floor(rows / 2);

    let cnt = 1;
    let deg = _.random(360);
    let r = radius === undefined ? Math.floor(Math.min(cols, rows) / 3) : radius;

    const step = reverse ? 15 : -15;
    const max = Math.abs(360 / step);

    while (cnt <= max) {
      const i = oy + Math.floor(r * Math.sin(deg / 180 * Math.PI));
      const j = ox + Math.floor(r * Math.cos(deg / 180 * Math.PI));

      const cell = new Cell(i, j, {
        electronCount,
        forceElectrons,
        background: CELL_HIGHLIGHT,
        electronOptions: {
          lifeTime,
          speed: 3,
          color: CELL_HIGHLIGHT } });




      cell.delay(cnt * 16);

      cnt++;
      deg += step;
      r += increment;
    }
  },

  explode(matrix) {
    stripOld();

    if (matrix) {
      const { length } = matrix;

      const max = Math.min(
      50,
      _.random(Math.floor(length / 20), Math.floor(length / 10)));


      for (let idx = 0; idx < max; idx++) {
        const [i, j] = matrix[idx];

        const cell = new Cell(i, j, this.explodeOptions);

        cell.paintNextTo(mainLayer);
      }
    } else {
      const max = _.random(10, 20);

      for (let idx = 0; idx < max; idx++) {
        createRandomCell(this.explodeOptions);
      }
    }
  } };


let timer;

function queue() {
  const text = 'CUIDADO';

  let i = 0;
  const max = text.length;

  const run = () => {
    if (i >= max) return;

    shape.print(text.slice(0, ++i));
    timer = setTimeout(run, 1e3 + i);
  };

  run();
}

function drawMissingNo(matrix) {
  // Renderiza o sprite do MissingNo baseado na matriz fornecida.
  mainLayer.repaint((ctx) => {
    ctx.fillStyle = FONT_COLOR; // Define a cor dos pixels como FONT_COLOR.
    matrix.forEach(([x, y]) => {
      ctx.fillRect(
        x * CELL_DISTANCE,
        y * CELL_DISTANCE,
        CELL_SIZE,
        CELL_SIZE
      );
    });
  });
}
function drawGlitchTextInPixels(text, startX = 5, startY = 5) {
  // Define um "mapa" para renderizar as letras em pixels.
  const pixelFont = {
    M: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]],
    I: [[1, 0], [1, 1], [1, 2]],
    S: [[0, 0], [0, 1], [1, 0], [1, 2], [2, 1], [2, 2]],
    N: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 0], [2, 1], [2, 2]],
    G: [[0, 0], [0, 1], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2]],
    O: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]],
  };

  const glitchColors = ['#ff5353', '#328bf6', '#00b07c', '#cccccc']; // Efeito glitch.

  const scale = 4; // Tamanho dos pixels para texto.
  let offsetX = startX;

  text.split('').forEach((char) => {
    const charPixels = pixelFont[char.toUpperCase()] || [];

    charPixels.forEach(([x, y]) => {
      const pixelX = offsetX + x * scale + (Math.random() - 0.5) * 2; // Glitch horizontal.
      const pixelY = startY + y * scale + (Math.random() - 0.5) * 2; // Glitch vertical.

      mainLayer.paint((ctx) => {
        ctx.fillStyle = glitchColors[Math.floor(Math.random() * glitchColors.length)];
        ctx.fillRect(
          pixelX * CELL_DISTANCE,
          pixelY * CELL_DISTANCE,
          CELL_SIZE + Math.random() * 2, // Efeito de tamanho variável.
          CELL_SIZE + Math.random() * 2
        );
      });
    });

    offsetX += 4; // Espaçamento entre letras.
  });
}

function writeBoldTextInPixels(
  text,
  startX = 10,
  startY = 10,
  delay = 50
) {
  // Define um "mapa" para renderizar as letras em pixels (letras mais bold).
  const pixelFont = {
    C: [[0, 1], [0, 2], [1, 0], [2, 0], [3, 0], [4, 1], [4, 2], [3, 3], [2, 3], [1, 3]],
    U: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3]],
    I: [[1, 0], [1, 1], [1, 2], [1, 3]],
    D: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 2], [3, 1]],
    A: [[1, 0], [2, 0], [0, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [0, 3], [3, 3]],
    O: [[1, 0], [2, 0], [0, 1], [3, 1], [0, 2], [3, 2], [1, 3], [2, 3]],
  };

  const scale = 15; // Tamanho maior para os pixels do texto.
  const pixelColor = '#FF0000'; // Cor vermelha para destaque.
  let offsetX = startX;
  let offsetY = startY;

  const chars = text.split(''); // Divide o texto em caracteres.
  let currentCharIndex = 0;

  function drawNextChar() {
    if (currentCharIndex >= chars.length) {
      return; // Termina a animação.
    }

    const char = chars[currentCharIndex]?.toUpperCase();
    const charPixels = pixelFont[char] || [];

    charPixels.forEach(([x, y]) => {
      const pixelX = offsetX + x * scale;
      const pixelY = offsetY + y * scale;

      mainLayer.paint((ctx) => {
        ctx.fillStyle = pixelColor;
        ctx.fillRect(
          pixelX * CELL_DISTANCE,
          pixelY * CELL_DISTANCE,
          CELL_SIZE * 2.5, // Pixels mais grossos para efeito bold.
          CELL_SIZE * 2.5
        );
      });
    });

    currentCharIndex++;
    offsetX += scale * 5; // Espaçamento entre caracteres.

    setTimeout(drawNextChar, delay); // Próximo caractere.
  }

  drawNextChar();
}

// Modifique o countdown para chamar essa função ao final.
function renderBoldTextOptimized(text) {
  shape.clear(); // Limpa elementos anteriores.

  const matrix = shape.getTextMatrix(text, {
    fontWeight: 'bold',
    fontFamily: 'Arial',
  });

  matrix.forEach(([i, j]) => {
    const cell = new Cell(i, j, {
      background: '#FF0000', // Define a cor como vermelho.
      electronCount: 2, // Reduz o número de partículas.
      forceElectrons: false, // Evita forçar partículas extras.
    });

    cell.scheduleUpdate(500, 700); // Atualizações menos frequentes.
    cell.pin(); // Mantém a célula fixa no canvas.
  });
}

// Função para tocar som para o código Morse
const morseSounds = {
  dot: new Audio("./sound.wav"), // Caminho para o som do Morse
};

// Toca o som correspondente para "." ou "-"
function playMorseSound(unit) {
  if (unit === "." || unit === "-") {
    morseSounds.dot.currentTime = 0; // Reinicia o som
    morseSounds.dot.play(); // Reproduz o som
  }
}

// Função para renderizar "EU TE VEJO" com desaparecimento automático
function renderEuTeVejoEffect() {
  const text = "EU TE VEJO";
  let i = 0;
  const max = text.length;

  const run = () => {
    if (i >= max) {
      // Após completar, remove o texto após um pequeno atraso
      setTimeout(() => {
        shape.clear(); // Remove o texto da tela
      }, 1800); // Desaparece 1.5 segundos depois de exibir completamente
      return;
    }

    shape.print(text.slice(0, ++i));
    timer = setTimeout(run, 500 + i * 50); // Velocidade ajustada para ser mais rápida
  };

  run();
}

// Mantendo renderTypingEffectInPixels com texto Morse e som
function renderTypingEffectInPixels(text, startX, startY, delay = 150) {
  const pixelMatrix = shape.getTextMatrix(text, {
    fontWeight: "bold",
    fontFamily: "Arial",
  });

  const scale = 30; // Tamanho dos pixels
  let currentIndex = 0;

  function drawNextChar() {
    if (currentIndex >= pixelMatrix.length) {
      return; // Finaliza quando todos os pixels são renderizados.
    }

    const [row, col] = pixelMatrix[currentIndex];

    const cell = new Cell(row, col, {
      background: "#FF0000", // Define a cor como vermelho brilhante.
      electronCount: 0, // Remove partículas para evitar distrações.
      forceElectrons: false, // Evita partículas extras.
    });

    cell.pin(); // Mantém a célula fixa.

    // Adiciona o som do Morse
    const char = text[currentIndex];
    if (char === "." || char === "-") {
      playMorseSound(char); // Toca som apenas para pontos e traços
    }

    currentIndex++;
    setTimeout(drawNextChar, delay); // Próximo pixel.
  }

  drawNextChar();
}

// Função countdown com integração completa
function countdown() {
  const missingNoMatrix = [
    [2, 3], [2, 4], [2, 5], [3, 3], [3, 4], [3, 5], // Corpo superior
    [4, 3], [4, 5], [5, 3], [5, 5],                 // Corpo lateral
    [6, 4], [7, 4], [8, 4], [9, 4],                // Corpo inferior
  ];

  let step = 0;

  function drawStep() {
    if (step >= missingNoMatrix.length) {
      // Após o "EU TE VEJO", limpa e renderiza o próximo texto.
      setTimeout(() => {
        renderEuTeVejoEffect(); // Renderiza "EU TE VEJO" com desaparecimento automático

        setTimeout(() => {
          // Remove o "EU TE VEJO" antes de renderizar o próximo texto.
          shape.clear();

          // Renderiza o texto Morse com som
          renderTypingEffectInPixels(
            "..-. .- --.. / --- / .-..", // Texto em código Morse
            20, // Posição horizontal
            200, // Posição vertical
            50 // Intervalo mais rápido entre os caracteres Morse
          );
        }, 7000); // Atraso para limpar antes do próximo texto
      }, 2000); // Duração da exibição de "EU TE VEJO"
      return;
    }

    const segment = missingNoMatrix.slice(0, step + 1);
    drawMissingNo(segment);
    step++;

    setTimeout(drawStep, 100);
  }

  drawStep();
}


function galaxy() {
  shape.spiral({
    radius: 0,
    increment: 1,
    lifeTime: 100,
    electronCount: 1 });

  timer = setTimeout(galaxy, 16);
}

function ring() {
  shape.spiral();

  timer = setTimeout(ring, 16);
}

function startMissingNoEffect() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  document.body.appendChild(canvas);

  const TEXT = "MISS...I.SS?....G?......N?O......?";
  const FONT_SIZE = 80;
  const SPEED = 50; // Atualização do glitch
  const GLITCH_COLORS = ['#cccccc', '#999999', '#666666', '#333333', '#000000'];
  const BG_COLORS = ['#1d2227', '#2b2b2b', '#242424'];

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  function drawBackground() {
    for (let y = 0; y < canvas.height; y += 10) {
      for (let x = 0; x < canvas.width; x += 10) {
        if (Math.random() > 0.7) {
          ctx.fillStyle = BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)];
          ctx.fillRect(x, y, 10, 10);
        }
      }
    }
  }

  function drawText() {
    ctx.font = `${FONT_SIZE}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    for (let i = 0; i < TEXT.length; i++) {
      const offsetX = (Math.random() - 0.5) * 10; // Efeito de glitch horizontal
      const offsetY = (Math.random() - 0.5) * 10; // Efeito de glitch vertical

      ctx.fillStyle = GLITCH_COLORS[Math.floor(Math.random() * GLITCH_COLORS.length)];
      ctx.fillText(TEXT[i], centerX + i * 40 + offsetX, centerY + offsetY);
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawText();
    setTimeout(render, SPEED);
  }

  render();
}

startMissingNoEffect();

document.getElementById('input').addEventListener('keypress', ({ keyCode, target }) => {
  if (keyCode === 13) {
    clearTimeout(timer);
    const value = target.value.trim().toLowerCase(); // Converte a entrada para minúsculas
    target.value = '';

    switch (value) {
      case '#destroy':
        return shape.destroy();

      case '#init':
        return shape.init();

      case '#explode':
        return shape.explode();

      case '#clear':
        return shape.clear();

      case '#queue':
        return queue();

      case 'missingno': // Alterado para minúsculas
        return countdown();

      case '#galaxy':
        shape.clear();
        return galaxy();

      case '#ring':
        shape.clear();
        return ring();

      default:
        // Exibe o "HAHAHAH!" no efeito pow do shape
        return shape.print('HAHAHAH!');
    }
  }
});

shape.init();
shape.print('?');

// prevent zoom
document.addEventListener('touchmove', e => e.preventDefault());
