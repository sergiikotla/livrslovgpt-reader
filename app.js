(() => {
  "use strict";

  const app = document.querySelector("#app");
  const speeds = [0.75, 1, 1.25];
  const vocabularyKey = "loop-reader:vocabulary:v1";
  const state = {
    chapters: [],
    extras: [],
    chapter: null,
    translation: true,
    autoScroll: true,
    fontSize: "medium",
    translationBold: false,
    readerMode: "study",
    speed: 1,
    activeSegment: -1,
    activeWord: null,
    activeScene: -1,
    segmentNodes: [],
    wordNodes: [],
    sceneNodes: [],
    paragraphNodes: [],
    activeParagraph: -1,
    phraseEnd: null,
    phrasePlaybackId: 0,
    phraseFrame: null,
    vocabulary: [],
    pendingWordTap: null,
    vocabularyTrigger: null,
    toastTimer: null
  };

  const relative = (path) => String(path || "").replace(/^\/+/, "");
  const two = (value) => String(value).padStart(2, "0");
  const formatTime = (value) => {
    if (!Number.isFinite(value)) return "0:00";
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  };
  const formatDuration = (value) => {
    if (!Number.isFinite(value)) return "0:00";
    const rounded = Math.round(value);
    return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
  };
  const titleWithoutModel = (title, model) => {
    const suffix = model ? ` · ${model}` : "";
    return suffix && title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
  };
  const allReadings = () => [...state.chapters, ...state.extras];
  const readingCollection = () => state.chapter?.kind === "extra" ? state.extras : state.chapters;
  const findReading = (slug) => allReadings().find((item) => item.slug === slug);

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function playerTemplate() {
    app.className = "reader-shell";
    app.innerHTML = `
      <audio id="narration" preload="metadata"></audio>
      <header class="topbar">
        <button class="contents-back" id="back-to-contents" aria-label="Повернутися до змісту">
          <span class="back-arrow" aria-hidden="true">←</span>
          <span><strong>Зміст</strong><small>книга й екстра</small></span>
        </button>
        <div class="chapter-position" id="chapter-position"></div>
        <div class="header-tools">
          <button class="vocabulary-button" data-open-vocabulary aria-label="Відкрити словничок">
            <span>Слова</span><strong class="vocabulary-count">0</strong>
          </button>
          <div class="font-tools">
            <button class="round-button" id="font-settings-button" aria-label="Налаштувати розмір тексту" aria-expanded="false">Aa</button>
            <div class="font-settings" id="font-settings" hidden>
              <p>Розмір тексту</p>
              <div>
                <button data-font-size="small"><span>А</span><small>Малий</small></button>
                <button data-font-size="medium"><span>А</span><small>Звичайний</small></button>
                <button data-font-size="large"><span>А</span><small>Великий</small></button>
              </div>
              <button class="translation-weight-toggle" id="translation-weight-toggle" aria-pressed="false">
                <span><strong>Жирний переклад</strong><small>Український текст</small></span>
                <i aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      </header>
      <section class="chapter-hero">
        <div class="hero-image" id="hero-image" role="img"></div>
        <div class="hero-copy">
          <p class="eyebrow" id="eyebrow"></p>
          <h1 id="chapter-title"></h1>
          <p class="subtitle" id="chapter-subtitle"></p>
          <div class="hero-meta"><span id="chapter-duration"></span><span>SL · UA</span></div>
        </div>
      </section>
      <section class="reading-layout">
        <aside class="scene-strip" id="scene-strip" aria-label="Сцени тексту"></aside>
        <article class="reading-card" id="reading-card">
          <div class="reading-toolbar">
            <p><span class="live-dot"></span> Слухай і читай</p>
            <div class="reader-actions">
              <div class="mode-switch" role="group" aria-label="Режим читання">
                <button class="active" id="study-mode" aria-pressed="true">Фрази</button>
                <button id="book-mode" aria-pressed="false">Книга</button>
              </div>
              <button class="toggle active" id="translation-toggle">UA <span></span></button>
              <button class="toggle active" id="autoscroll-toggle">AUTO <span></span></button>
            </div>
          </div>
          <div class="story-text" id="story-text"></div>
          <div class="book-text" id="book-text" hidden></div>
        </article>
      </section>
      <section class="next-chapter" id="next-chapter" aria-label="Навігація між главами"></section>
      <div class="player-wrap">
        <div class="player" id="player">
          <button class="play-button" id="play-button" aria-label="Відтворити"><span class="play-icon"></span></button>
          <div class="track-info">
            <div><strong id="track-title"></strong><span id="track-time">0:00 / 0:00</span></div>
            <input id="seek" aria-label="Перемотування" type="range" min="0" max="1" step="0.01" value="0" />
          </div>
          <button class="speed-button" id="speed-button" aria-label="Змінити швидкість">1×</button>
        </div>
      </div>`;
  }

  function refs() {
    return {
      audio: document.querySelector("#narration"),
      card: document.querySelector("#reading-card"),
      story: document.querySelector("#story-text"),
      book: document.querySelector("#book-text"),
      scenes: document.querySelector("#scene-strip"),
      play: document.querySelector("#play-button"),
      player: document.querySelector("#player"),
      seek: document.querySelector("#seek"),
      time: document.querySelector("#track-time")
    };
  }

  function appendContentsItem(list, item, extra = false) {
    const row = element("li", `contents-item${extra ? " extra-item" : ""}`);
    const button = element("button", "contents-link");
    const image = element("img", "contents-cover");
    image.src = relative(item.scenes[0].image);
    image.alt = "";
    image.loading = "lazy";
    const copy = element("span", "contents-copy");
    copy.append(element("strong", "", titleWithoutModel(item.title, item.model)));
    if (item.model) copy.append(element("span", "contents-model", item.model));
    if (extra) copy.append(element("span", "contents-model extra-badge", "Поза книжкою"));
    copy.append(element("small", "", titleWithoutModel(item.titleUa, item.model)));
    button.append(
      element("span", "contents-number", extra ? `E${item.position || item.number}` : two(item.position || item.number)),
      image,
      copy,
      element("time", "contents-duration", formatDuration(item.duration))
    );
    button.addEventListener("click", () => loadChapter(item.slug, true));
    row.append(button);
    list.append(row);
  }

  function showContents(updateHistory = true) {
    cancelPendingWordTap();
    cancelPhrasePreview();
    refs().audio?.pause();
    document.title = "Зміст · Loop";
    app.className = "reader-shell contents-view";
    app.innerHTML = `
      <header class="contents-header">
        <div class="contents-brand">
          <span class="contents-brand-identity">
            <span class="brand-mark" aria-hidden="true">L</span>
            <span><strong>Loop</strong><small>словенська з перекладом і озвученням</small></span>
          </span>
          <button class="vocabulary-button" data-open-vocabulary aria-label="Відкрити словничок">
            <span>Слова</span><strong class="vocabulary-count">0</strong>
          </button>
        </div>
      </header>
      <main class="contents-main">
        <ol class="contents-list" id="contents-list"></ol>
        <section class="extras-section" aria-labelledby="extras-title">
          <div class="extras-heading">
            <p>Окремо від історії Loop</p>
            <h2 id="extras-title">Екстра-читання</h2>
            <span>Додаткові словенсько-українські тексти з власним озвученням.</span>
          </div>
          <ol class="contents-list extras-list" id="extras-list"></ol>
        </section>
      </main>`;

    const list = document.querySelector("#contents-list");
    state.chapters.forEach((item) => appendContentsItem(list, item));
    const extrasList = document.querySelector("#extras-list");
    state.extras.forEach((item) => appendContentsItem(extrasList, item, true));

    bindVocabularyButtons();

    if (updateHistory) history.pushState(null, "", "#contents");
    document.onkeydown = null;
    document.onclick = null;
    window.scrollTo({ top: 0, behavior: updateHistory ? "smooth" : "auto" });
  }

  function applyFontSize(size, persist = false) {
    const allowed = ["small", "medium", "large"];
    state.fontSize = allowed.includes(size) ? size : "medium";
    const card = refs().card;
    card.classList.remove("font-small", "font-medium", "font-large");
    card.classList.add(`font-${state.fontSize}`);
    document.querySelectorAll("[data-font-size]").forEach((button) => {
      button.classList.toggle("active", button.dataset.fontSize === state.fontSize);
    });
    if (persist) localStorage.setItem("loop-reader:font-size", state.fontSize);
  }

  function applyTranslationWeight(enabled, persist = false) {
    state.translationBold = Boolean(enabled);
    refs().card.classList.toggle("translation-bold", state.translationBold);
    const toggle = document.querySelector("#translation-weight-toggle");
    toggle.classList.toggle("active", state.translationBold);
    toggle.setAttribute("aria-pressed", String(state.translationBold));
    if (persist) localStorage.setItem("loop-reader:translation-bold", String(state.translationBold));
  }

  function renderScenes() {
    const { scenes } = refs();
    scenes.replaceChildren();
    state.sceneNodes = state.chapter.scenes.map((scene) => {
      const button = element("button", "scene");
      const image = element("img");
      image.src = relative(scene.image);
      image.alt = `Сцена ${scene.number}`;
      button.append(image, element("span", "", two(scene.number)));
      button.addEventListener("click", () => playFrom(scene.start));
      scenes.append(button);
      return button;
    });
  }

  function renderStory() {
    const { story } = refs();
    story.replaceChildren();
    state.segmentNodes = [];
    state.wordNodes = [];

    state.chapter.segments.forEach((segment) => {
      const wrapper = element("div", "text-segment");
      const slovene = element("p", "slovene");
      const words = [];

      segment.words.forEach((word) => {
        const button = createInteractiveWord(word, segment, "word");
        slovene.append(button);
        words.push(button);
      });

      wrapper.append(slovene, element("p", "ukrainian", segment.ua));
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "button");
      wrapper.setAttribute("aria-label", `Прослухати фразу: ${segment.sl}`);
      wrapper.addEventListener("click", () => playPhrase(segment));
      wrapper.addEventListener("keydown", (event) => {
        if (event.target === wrapper && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          playPhrase(segment);
        }
      });
      story.append(wrapper);
      state.segmentNodes.push(wrapper);
      state.wordNodes.push(words);
    });
  }

  function renderBook() {
    const { book } = refs();
    book.replaceChildren();
    const paragraphs = state.chapter.paragraphs || state.chapter.segments.map((segment) => ({
      sl: segment.sl,
      ua: segment.ua,
      start: segment.start,
      end: segment.end
    }));
    const segmentsByParagraph = new Map();
    state.chapter.segments.forEach((segment) => {
      const group = segmentsByParagraph.get(segment.paragraph) || [];
      group.push(segment);
      segmentsByParagraph.set(segment.paragraph, group);
    });

    state.paragraphNodes = paragraphs.map((paragraph, paragraphIndex) => {
      const wrapper = element("section", "book-paragraph");
      const slovene = element("p", "book-slovene");
      const segments = segmentsByParagraph.get(paragraphIndex) || [];
      if (segments.length) {
        const tokens = segments.flatMap((segment) => segment.words.map((word) => ({ word, segment })));
        const positions = [];
        let searchFrom = 0;
        let tokenMatch = true;
        tokens.forEach((token) => {
          if (!tokenMatch) return;
          const start = paragraph.sl.indexOf(token.word.text, searchFrom);
          if (start >= 0) {
            positions.push({ ...token, start });
            searchFrom = start + token.word.text.length;
          } else {
            tokenMatch = false;
          }
        });
        if (tokenMatch) {
          let cursor = 0;
          positions.forEach(({ word, segment, start }) => {
            slovene.append(document.createTextNode(paragraph.sl.slice(cursor, start)));
            slovene.append(createInteractiveWord(word, segment, "book-word"));
            cursor = start + word.text.length;
          });
          slovene.append(document.createTextNode(paragraph.sl.slice(cursor)));
        } else {
          slovene.textContent = paragraph.sl;
        }
      } else {
        slovene.textContent = paragraph.sl;
      }
      wrapper.append(
        slovene,
        element("p", "book-translation", paragraph.ua)
      );
      book.append(wrapper);
      return wrapper;
    });
  }

  function createInteractiveWord(word, segment, className) {
    const button = element("button", className, word.text);
    button.dataset.start = String(word.start);
    button.dataset.end = String(word.end);
    button.setAttribute("aria-label", `${word.text}. Натисніть один раз, щоб прослухати речення; двічі — щоб додати слово.`);
    button.addEventListener("click", (event) => handleWordTap(event, button, word, segment));
    button.addEventListener("keydown", (event) => {
      if (event.shiftKey && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        addVocabularyWord(word.text, segment);
      }
    });
    return button;
  }

  function handleWordTap(event, button, word, segment) {
    event.stopPropagation();
    if (event.detail === 0) {
      playPhrase(segment);
      return;
    }

    const now = Date.now();
    const pending = state.pendingWordTap;
    if (pending?.button === button && now - pending.time <= 360) {
      clearTimeout(pending.timer);
      state.pendingWordTap = null;
      addVocabularyWord(word.text, segment);
      return;
    }

    if (pending) {
      clearTimeout(pending.timer);
      playPhrase(pending.segment);
    }
    const timer = setTimeout(() => {
      if (state.pendingWordTap?.button === button) {
        state.pendingWordTap = null;
        playPhrase(segment);
      }
    }, 300);
    state.pendingWordTap = { button, segment, time: now, timer };
  }

  function applyReaderMode(mode, persist = false) {
    cancelPendingWordTap();
    state.readerMode = mode === "book" ? "book" : "study";
    const isBook = state.readerMode === "book";
    refs().story.hidden = isBook;
    refs().book.hidden = !isBook;
    document.querySelector("#study-mode").classList.toggle("active", !isBook);
    document.querySelector("#study-mode").setAttribute("aria-pressed", String(!isBook));
    document.querySelector("#book-mode").classList.toggle("active", isBook);
    document.querySelector("#book-mode").setAttribute("aria-pressed", String(isBook));
    if (persist) localStorage.setItem("loop-reader:mode", state.readerMode);
    if (state.chapter) updateAt(refs().audio.currentTime || 0);
  }

  function renderNextChapter() {
    const container = document.querySelector("#next-chapter");
    const collection = readingCollection();
    const isExtra = state.chapter.kind === "extra";
    const currentIndex = collection.findIndex((item) => item.slug === state.chapter.slug);
    const next = collection[currentIndex + 1];
    container.replaceChildren();

    if (!next) {
      const finish = element("button", "next-chapter-card finished");
      finish.append(
        element("span", "next-kicker", isExtra ? "Усі екстра-тексти прочитано" : "Усі глави прочитано"),
        element("strong", "", "Повернутися до змісту"),
        element("span", "next-arrow", "→")
      );
      finish.addEventListener("click", () => showContents(true));
      container.append(finish);
      return;
    }

    const button = element("button", "next-chapter-card");
    const image = element("img");
    image.src = relative(next.scenes[0].image);
    image.alt = "";
    const copy = element("span", "next-copy");
    copy.append(
      element("span", "next-kicker", isExtra ? `Наступний екстра-текст · E${next.position || next.number}` : `Наступна глава · ${two(next.position || next.number)}`),
      element("strong", "", next.title),
      element("small", "", next.titleUa)
    );
    button.append(image, copy, element("time", "", formatDuration(next.duration)), element("span", "next-arrow", "→"));
    button.addEventListener("click", () => loadChapter(next.slug, true));
    container.append(button);
  }

  function renderChapter() {
    const chapter = state.chapter;
    const collection = readingCollection();
    const isExtra = chapter.kind === "extra";
    const position = chapter.position || chapter.number;
    const progress = (position / collection.length) * 100;
    document.title = `${chapter.title} · Loop`;
    document.querySelector("#chapter-position").innerHTML = `<span>${isExtra ? `E${position}` : two(position)}</span><i style="background:linear-gradient(90deg,var(--apricot) ${progress}%,rgba(23,63,58,.15) ${progress}%)"></i><span>${two(collection.length)}</span>`;
    document.querySelector("#eyebrow").textContent = isExtra
      ? `Dodatno branje · ${chapter.level}`
      : chapter.model
        ? `${chapter.number}. poglavje · ${chapter.model} · ${chapter.level}`
        : `${chapter.number}. poglavje · ${chapter.level}`;
    document.querySelector("#chapter-title").textContent = chapter.title;
    document.querySelector("#chapter-subtitle").textContent = chapter.subtitle;
    document.querySelector("#chapter-duration").textContent = `${Math.ceil(chapter.duration / 60)} min`;
    document.querySelector("#track-title").textContent = chapter.title;

    const heroSection = document.querySelector(".chapter-hero");
    heroSection.classList.toggle("comparison", Boolean(chapter.model));
    heroSection.classList.toggle("extra", isExtra);
    const hero = document.querySelector("#hero-image");
    const heroScene = isExtra ? chapter.scenes[0] : chapter.scenes[1] || chapter.scenes[0];
    hero.setAttribute("aria-label", chapter.titleUa);
    hero.style.backgroundImage = chapter.model
      ? `linear-gradient(0deg,rgba(10,29,27,.84) 0%,rgba(10,29,27,0) 58%),url('${relative(heroScene.image)}')`
      : `linear-gradient(90deg,rgba(255,249,237,.98) 0%,rgba(255,249,237,.9) 34%,rgba(255,249,237,.14) 66%),url('${relative(heroScene.image)}')`;

    const { audio, seek, player } = refs();
    cancelPhrasePreview();
    audio.pause();
    audio.src = relative(chapter.audio);
    audio.playbackRate = state.speed;
    seek.max = String(chapter.duration || 1);
    seek.value = "0";
    seek.style.setProperty("--progress", "0%");
    player.classList.remove("playing");
    state.activeSegment = -1;
    state.activeWord = null;
    state.activeScene = -1;
    state.activeParagraph = -1;
    refs().card.classList.toggle("translation-off", !state.translation);
    document.querySelector("#translation-toggle").classList.toggle("active", state.translation);
    document.querySelector("#autoscroll-toggle").classList.toggle("active", state.autoScroll);
    applyFontSize(state.fontSize);
    applyTranslationWeight(state.translationBold);

    renderScenes();
    renderStory();
    renderBook();
    applyReaderMode(state.readerMode);
    renderNextChapter();
    updateAt(0);
  }

  function chapterProgressKey() {
    return `loop-reader:${state.chapter.slug}:time`;
  }

  async function loadChapter(slug, userInitiated = false) {
    try {
      cancelPendingWordTap();
      refs().audio?.pause();
      if (!document.querySelector("#narration")) {
        playerTemplate();
        bindEvents();
      }
      const response = await fetch(`data/${slug}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.chapter = await response.json();
      renderChapter();
      if (userInitiated) history.pushState(null, "", `#${slug}`);
      localStorage.setItem("loop-reader:last-chapter", slug);
      if (userInitiated) window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      showError("Не вдалося завантажити главу. Спробуйте оновити сторінку.", error);
    }
  }

  function playFrom(start) {
    const { audio } = refs();
    cancelPendingWordTap();
    cancelPhrasePreview();
    audio.currentTime = start;
    updateAt(start);
    audio.play().catch(() => {});
  }

  function cancelPhrasePreview(pause = false) {
    state.phrasePlaybackId += 1;
    state.phraseEnd = null;
    if (state.phraseFrame !== null) cancelAnimationFrame(state.phraseFrame);
    state.phraseFrame = null;
    if (pause) refs().audio?.pause();
  }

  function playPhrase(segment) {
    const { audio, player, play } = refs();
    cancelPhrasePreview();
    const playbackId = state.phrasePlaybackId;
    state.phraseEnd = segment.end;
    audio.currentTime = segment.start;
    updateAt(segment.start);
    player.classList.remove("playing");
    play.setAttribute("aria-label", "Відтворити весь текст");

    const monitor = () => {
      if (playbackId !== state.phrasePlaybackId || state.phraseEnd === null) return;
      if (audio.currentTime >= state.phraseEnd - .025 || audio.ended) {
        const end = state.phraseEnd;
        cancelPhrasePreview();
        audio.pause();
        audio.currentTime = Math.min(end, audio.duration || end);
        updateAt(audio.currentTime);
        return;
      }
      state.phraseFrame = requestAnimationFrame(monitor);
    };

    audio.play().then(() => {
      if (playbackId === state.phrasePlaybackId) state.phraseFrame = requestAnimationFrame(monitor);
    }).catch(() => cancelPhrasePreview());
  }

  function findSegment(time) {
    const segments = state.chapter.segments;
    let low = 0;
    let high = segments.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const segment = segments[mid];
      if (time < segment.start) high = mid - 1;
      else if (time > segment.end + .7) low = mid + 1;
      else return mid;
    }
    return -1;
  }

  function updateAt(time) {
    const { audio, seek } = refs();
    const duration = Number.isFinite(audio.duration) ? audio.duration : state.chapter.duration;
    seek.value = String(Math.min(time, duration || 1));
    seek.max = String(duration || 1);
    seek.style.setProperty("--progress", `${duration ? (time / duration) * 100 : 0}%`);
    refs().time.textContent = `${formatTime(time)} / ${formatTime(duration)}`;

    const segmentIndex = findSegment(time);
    if (segmentIndex !== state.activeSegment) {
      if (state.activeSegment >= 0) state.segmentNodes[state.activeSegment]?.classList.remove("active");
      state.activeSegment = segmentIndex;
      const active = state.segmentNodes[segmentIndex];
      active?.classList.add("active");
      if (state.readerMode === "study" && state.autoScroll && active && !audio.paused) {
        active.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    let nextWord = null;
    if (segmentIndex >= 0) {
      const segment = state.chapter.segments[segmentIndex];
      const wordIndex = segment.words.findIndex((word) => time >= word.start && time <= word.end + .08);
      if (wordIndex >= 0) nextWord = state.wordNodes[segmentIndex][wordIndex];
    }
    if (nextWord !== state.activeWord) {
      state.activeWord?.classList.remove("now");
      nextWord?.classList.add("now");
      state.activeWord = nextWord;
    }

    const paragraphs = state.chapter.paragraphs || [];
    const paragraphIndex = paragraphs.findIndex((paragraph) => time >= paragraph.start && time <= paragraph.end + .7);
    if (paragraphIndex !== state.activeParagraph) {
      if (state.activeParagraph >= 0) state.paragraphNodes[state.activeParagraph]?.classList.remove("active");
      state.activeParagraph = paragraphIndex;
      const activeParagraph = state.paragraphNodes[paragraphIndex];
      activeParagraph?.classList.add("active");
      if (state.readerMode === "book" && state.autoScroll && activeParagraph && !audio.paused) {
        activeParagraph.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    let sceneIndex = 0;
    state.chapter.scenes.forEach((scene, index) => { if (time >= scene.start) sceneIndex = index; });
    if (sceneIndex !== state.activeScene) {
      if (state.activeScene >= 0) state.sceneNodes[state.activeScene]?.classList.remove("active");
      state.activeScene = sceneIndex;
      state.sceneNodes[sceneIndex]?.classList.add("active");
    }
  }

  function toggleTranslation() {
    state.translation = !state.translation;
    refs().card.classList.toggle("translation-off", !state.translation);
    document.querySelector("#translation-toggle").classList.toggle("active", state.translation);
  }

  function cancelPendingWordTap() {
    if (state.pendingWordTap) clearTimeout(state.pendingWordTap.timer);
    state.pendingWordTap = null;
  }

  function normalizeVocabularyWord(value) {
    return String(value || "")
      .replace(/^[^\p{L}\p{N}'’ʼ-]+|[^\p{L}\p{N}'’ʼ-]+$/gu, "")
      .toLocaleLowerCase("sl");
  }

  function loadVocabulary() {
    try {
      const parsed = JSON.parse(localStorage.getItem(vocabularyKey) || "[]");
      state.vocabulary = Array.isArray(parsed)
        ? parsed.filter((entry) => entry && entry.word && entry.normalized && entry.sentenceSl && entry.sentenceUa)
        : [];
    } catch {
      state.vocabulary = [];
    }
  }

  function saveVocabulary(nextVocabulary) {
    try {
      localStorage.setItem(vocabularyKey, JSON.stringify(nextVocabulary));
      state.vocabulary = nextVocabulary;
      updateVocabularyBadges();
      return true;
    } catch {
      showToast("Не вдалося зберегти слово у цьому браузері.");
      return false;
    }
  }

  function addVocabularyWord(wordText, segment) {
    const normalized = normalizeVocabularyWord(wordText);
    if (!normalized || !/[\p{L}\p{N}]/u.test(normalized)) {
      showToast("Цей знак не можна додати як слово.");
      return;
    }
    if (state.vocabulary.some((entry) => entry.normalized === normalized)) {
      showToast(`«${wordText}» уже є у словничку.`);
      return;
    }

    const entry = {
      id: `${normalized}:${Date.now()}`,
      word: String(wordText).trim(),
      normalized,
      sentenceSl: segment.sl,
      sentenceUa: segment.ua,
      chapterSlug: state.chapter.slug,
      chapterTitle: state.chapter.title,
      level: state.chapter.level,
      addedAt: new Date().toISOString()
    };
    if (saveVocabulary([entry, ...state.vocabulary])) showToast(`«${entry.word}» додано до словничка.`);
  }

  function removeVocabularyWord(id) {
    const next = state.vocabulary.filter((entry) => entry.id !== id);
    if (next.length === state.vocabulary.length) return;
    if (saveVocabulary(next)) renderVocabulary();
  }

  function ensureVocabularyUi() {
    if (document.querySelector("#vocabulary-layer")) return;
    const layer = element("div", "vocabulary-layer");
    layer.id = "vocabulary-layer";
    layer.hidden = true;
    layer.innerHTML = `
      <div class="vocabulary-backdrop" data-close-vocabulary></div>
      <aside class="vocabulary-panel" role="dialog" aria-modal="true" aria-labelledby="vocabulary-title">
        <header class="vocabulary-header">
          <div>
            <p>Loop</p>
            <h2 id="vocabulary-title">Мій словничок</h2>
            <span id="vocabulary-total">Збережено: 0</span>
          </div>
          <button class="vocabulary-close" data-close-vocabulary aria-label="Закрити словничок">×</button>
        </header>
        <div class="vocabulary-list" id="vocabulary-list"></div>
      </aside>`;
    const toast = element("div", "reader-toast");
    toast.id = "reader-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(layer, toast);
    layer.querySelectorAll("[data-close-vocabulary]").forEach((button) => {
      button.addEventListener("click", closeVocabulary);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !layer.hidden) {
        event.preventDefault();
        closeVocabulary();
      }
    });
  }

  function bindVocabularyButtons() {
    document.querySelectorAll("[data-open-vocabulary]").forEach((button) => {
      button.addEventListener("click", () => openVocabulary(button));
    });
    updateVocabularyBadges();
  }

  function updateVocabularyBadges() {
    document.querySelectorAll(".vocabulary-count").forEach((badge) => {
      badge.textContent = String(state.vocabulary.length);
    });
    const total = document.querySelector("#vocabulary-total");
    if (total) total.textContent = `Збережено: ${state.vocabulary.length}`;
  }

  function openVocabulary(trigger) {
    cancelPendingWordTap();
    cancelPhrasePreview(true);
    state.vocabularyTrigger = trigger || document.activeElement;
    renderVocabulary();
    const layer = document.querySelector("#vocabulary-layer");
    layer.hidden = false;
    document.body.classList.add("vocabulary-open");
    layer.querySelector(".vocabulary-close").focus();
  }

  function closeVocabulary() {
    const layer = document.querySelector("#vocabulary-layer");
    if (!layer || layer.hidden) return;
    layer.hidden = true;
    document.body.classList.remove("vocabulary-open");
    state.vocabularyTrigger?.focus?.();
    state.vocabularyTrigger = null;
  }

  function renderVocabulary() {
    const list = document.querySelector("#vocabulary-list");
    if (!list) return;
    list.replaceChildren();
    updateVocabularyBadges();
    if (!state.vocabulary.length) {
      const empty = element("section", "vocabulary-empty");
      empty.append(
        element("strong", "", "Тут поки немає слів"),
        element("p", "", "Двічі торкніться або двічі клацніть по слову в тексті. Ми збережемо слово разом із реченням та його перекладом.")
      );
      list.append(empty);
      return;
    }

    state.vocabulary.forEach((entry) => {
      const card = element("article", "vocabulary-card");
      const remove = element("button", "vocabulary-remove", "Видалити");
      remove.setAttribute("aria-label", `Видалити слово ${entry.word}`);
      remove.addEventListener("click", () => removeVocabularyWord(entry.id));
      const metaText = entry.level && !entry.chapterTitle.includes(entry.level)
        ? `${entry.chapterTitle} · ${entry.level}`
        : entry.chapterTitle;
      const meta = element("p", "vocabulary-meta", metaText);
      card.append(
        remove,
        element("strong", "vocabulary-word", entry.word),
        element("p", "vocabulary-sentence", entry.sentenceSl),
        element("p", "vocabulary-translation", entry.sentenceUa),
        meta
      );
      list.append(card);
    });
  }

  function showToast(message) {
    const toast = document.querySelector("#reader-toast");
    if (!toast) return;
    clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.add("visible");
    state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
  }

  function bindEvents() {
    const { audio, play, player, seek } = refs();
    document.querySelector("#back-to-contents").addEventListener("click", () => showContents(true));
    bindVocabularyButtons();
    const fontButton = document.querySelector("#font-settings-button");
    const fontSettings = document.querySelector("#font-settings");
    fontButton.addEventListener("click", (event) => {
      event.stopPropagation();
      fontSettings.hidden = !fontSettings.hidden;
      fontButton.classList.toggle("active", !fontSettings.hidden);
      fontButton.setAttribute("aria-expanded", String(!fontSettings.hidden));
    });
    fontSettings.querySelectorAll("[data-font-size]").forEach((button) => {
      button.addEventListener("click", () => {
        applyFontSize(button.dataset.fontSize, true);
        fontSettings.hidden = true;
        fontButton.classList.remove("active");
        fontButton.setAttribute("aria-expanded", "false");
      });
    });
    document.querySelector("#translation-weight-toggle").addEventListener("click", (event) => {
      event.stopPropagation();
      applyTranslationWeight(!state.translationBold, true);
    });
    document.onclick = (event) => {
      if (!event.target.closest(".font-tools")) {
        fontSettings.hidden = true;
        fontButton.classList.remove("active");
        fontButton.setAttribute("aria-expanded", "false");
      }
    };
    document.querySelector("#translation-toggle").addEventListener("click", toggleTranslation);
    document.querySelector("#study-mode").addEventListener("click", () => applyReaderMode("study", true));
    document.querySelector("#book-mode").addEventListener("click", () => applyReaderMode("book", true));
    document.querySelector("#autoscroll-toggle").addEventListener("click", (event) => {
      state.autoScroll = !state.autoScroll;
      event.currentTarget.classList.toggle("active", state.autoScroll);
    });
    play.addEventListener("click", () => {
      cancelPendingWordTap();
      if (state.phraseEnd !== null) {
        cancelPhrasePreview();
        player.classList.add("playing");
        play.setAttribute("aria-label", "Пауза");
        if (audio.paused) audio.play().catch(() => {});
        return;
      }
      audio.paused ? audio.play().catch(() => {}) : audio.pause();
    });
    document.querySelector("#speed-button").addEventListener("click", (event) => {
      const index = speeds.indexOf(state.speed);
      state.speed = speeds[(index + 1) % speeds.length];
      audio.playbackRate = state.speed;
      event.currentTarget.textContent = `${state.speed}×`;
    });
    seek.addEventListener("input", (event) => {
      cancelPendingWordTap();
      cancelPhrasePreview(true);
      audio.currentTime = Number(event.currentTarget.value);
      updateAt(audio.currentTime);
    });
    audio.addEventListener("play", () => {
      if (state.phraseEnd === null) {
        player.classList.add("playing");
        play.setAttribute("aria-label", "Пауза");
      }
    });
    audio.addEventListener("pause", () => { player.classList.remove("playing"); play.setAttribute("aria-label", "Відтворити"); });
    audio.addEventListener("ended", () => player.classList.remove("playing"));
    audio.addEventListener("timeupdate", () => {
      updateAt(audio.currentTime);
      if (Math.floor(audio.currentTime) % 5 === 0) localStorage.setItem(chapterProgressKey(), String(audio.currentTime));
    });
    audio.addEventListener("loadedmetadata", () => {
      const saved = Number(localStorage.getItem(chapterProgressKey()));
      if (Number.isFinite(saved) && saved > 5 && saved < audio.duration - 5) audio.currentTime = saved;
      updateAt(audio.currentTime);
    });
    document.onkeydown = (event) => {
      const vocabularyLayer = document.querySelector("#vocabulary-layer");
      if (vocabularyLayer && !vocabularyLayer.hidden) return;
      if (event.key === "Escape") {
        fontSettings.hidden = true;
        fontButton.classList.remove("active");
        fontButton.setAttribute("aria-expanded", "false");
      }
      if (event.code === "Space" && !["INPUT", "BUTTON"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        if (state.phraseEnd !== null) {
          cancelPhrasePreview();
          if (audio.paused) audio.play().catch(() => {});
        } else {
          audio.paused ? audio.play().catch(() => {}) : audio.pause();
        }
      }
    };
  }

  function showError(message, error) {
    console.error(error);
    app.innerHTML = `<section class="error-card"><span class="brand-mark">L</span><h1>Щось пішло не так</h1><p>${message}</p></section>`;
  }

  async function init() {
    try {
      loadVocabulary();
      ensureVocabularyUi();
      const [chaptersResponse, extrasResponse] = await Promise.all([
        fetch("data/chapters.json"),
        fetch("data/extras.json")
      ]);
      if (!chaptersResponse.ok) throw new Error(`HTTP ${chaptersResponse.status}`);
      if (!extrasResponse.ok) throw new Error(`HTTP ${extrasResponse.status}`);
      state.chapters = await chaptersResponse.json();
      state.extras = await extrasResponse.json();
      const savedFontSize = localStorage.getItem("loop-reader:font-size");
      if (["small", "medium", "large"].includes(savedFontSize)) state.fontSize = savedFontSize;
      state.translationBold = localStorage.getItem("loop-reader:translation-bold") === "true";
      state.readerMode = localStorage.getItem("loop-reader:mode") === "book" ? "book" : "study";
      const hash = location.hash.slice(1);
      const initial = findReading(hash)?.slug;
      if (initial) await loadChapter(initial);
      else showContents(false);

      window.addEventListener("popstate", () => {
        const target = findReading(location.hash.slice(1));
        if (target) loadChapter(target.slug, false);
        else showContents(false);
      });
    } catch (error) {
      showError("Не вдалося завантажити дані плеєра. Спробуйте оновити сторінку.", error);
    }
  }

  init();
})();
