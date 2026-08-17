(() => {
  "use strict";

  const app = document.querySelector("#app");
  const speeds = [0.75, 1, 1.25];
  const state = {
    chapters: [],
    chapter: null,
    translation: true,
    autoScroll: true,
    speed: 1,
    activeSegment: -1,
    activeWord: null,
    activeScene: -1,
    segmentNodes: [],
    wordNodes: [],
    sceneNodes: []
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
          <span><strong>Зміст</strong><small>усі глави</small></span>
        </button>
        <div class="chapter-position" id="chapter-position"></div>
        <button class="round-button" id="header-translation" aria-label="Перемкнути переклад">Aa</button>
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
        <aside class="scene-strip" id="scene-strip" aria-label="Сцени глави"></aside>
        <article class="reading-card" id="reading-card">
          <div class="reading-toolbar">
            <p><span class="live-dot"></span> Слухай і читай</p>
            <div>
              <button class="toggle active" id="translation-toggle">UA <span></span></button>
              <button class="toggle active" id="autoscroll-toggle">AUTO <span></span></button>
            </div>
          </div>
          <div class="story-text" id="story-text"></div>
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
      scenes: document.querySelector("#scene-strip"),
      play: document.querySelector("#play-button"),
      player: document.querySelector("#player"),
      seek: document.querySelector("#seek"),
      time: document.querySelector("#track-time")
    };
  }

  function showContents(updateHistory = true) {
    refs().audio?.pause();
    document.title = "Зміст · Loop";
    app.className = "reader-shell contents-view";
    app.innerHTML = `
      <header class="contents-header">
        <div class="contents-brand">
          <span class="brand-mark" aria-hidden="true">L</span>
          <span><strong>Loop</strong><small>словенська з перекладом і озвученням</small></span>
        </div>
      </header>
      <main class="contents-main">
        <ol class="contents-list" id="contents-list"></ol>
      </main>`;

    const list = document.querySelector("#contents-list");
    state.chapters.forEach((item) => {
      const row = element("li", "contents-item");
      const button = element("button", "contents-link");
      const image = element("img", "contents-cover");
      image.src = relative(item.scenes[0].image);
      image.alt = "";
      const copy = element("span", "contents-copy");
      copy.append(element("strong", "", item.title), element("small", "", item.titleUa));
      button.append(
        element("span", "contents-number", two(item.position || item.number)),
        image,
        copy,
        element("time", "contents-duration", formatDuration(item.duration))
      );
      button.addEventListener("click", () => loadChapter(item.slug, true));
      row.append(button);
      list.append(row);
    });

    if (updateHistory) history.pushState(null, "", "#contents");
    document.onkeydown = null;
    window.scrollTo({ top: 0, behavior: updateHistory ? "smooth" : "auto" });
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

      segment.words.forEach((word, index) => {
        const button = element("button", "word", word.text);
        button.dataset.start = String(word.start);
        button.dataset.end = String(word.end);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          playFrom(segment.start);
        });
        slovene.append(button);
        words.push(button);
      });

      wrapper.append(slovene, element("p", "ukrainian", segment.ua));
      wrapper.addEventListener("click", () => playFrom(segment.start));
      story.append(wrapper);
      state.segmentNodes.push(wrapper);
      state.wordNodes.push(words);
    });
  }

  function renderNextChapter() {
    const container = document.querySelector("#next-chapter");
    const currentIndex = state.chapters.findIndex((item) => item.slug === state.chapter.slug);
    const next = state.chapters[currentIndex + 1];
    container.replaceChildren();

    if (!next) {
      const finish = element("button", "next-chapter-card finished");
      finish.append(
        element("span", "next-kicker", "Усі глави прочитано"),
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
      element("span", "next-kicker", `Наступна глава · ${two(next.position || next.number)}`),
      element("strong", "", next.title),
      element("small", "", next.titleUa)
    );
    button.append(image, copy, element("time", "", formatDuration(next.duration)), element("span", "next-arrow", "→"));
    button.addEventListener("click", () => loadChapter(next.slug, true));
    container.append(button);
  }

  function renderChapter() {
    const chapter = state.chapter;
    const position = chapter.position || chapter.number;
    const progress = (position / state.chapters.length) * 100;
    document.title = `${chapter.title} · Loop`;
    document.querySelector("#chapter-position").innerHTML = `<span>${two(position)}</span><i style="background:linear-gradient(90deg,var(--apricot) ${progress}%,rgba(23,63,58,.15) ${progress}%)"></i><span>${two(state.chapters.length)}</span>`;
    document.querySelector("#eyebrow").textContent = chapter.model
      ? `${chapter.number}. poglavje · ${chapter.model} · ${chapter.level}`
      : `${chapter.number}. poglavje · ${chapter.level}`;
    document.querySelector("#chapter-title").textContent = chapter.title;
    document.querySelector("#chapter-subtitle").textContent = chapter.subtitle;
    document.querySelector("#chapter-duration").textContent = `${Math.ceil(chapter.duration / 60)} min`;
    document.querySelector("#track-title").textContent = chapter.title;

    const heroSection = document.querySelector(".chapter-hero");
    heroSection.classList.toggle("comparison", Boolean(chapter.model));
    const hero = document.querySelector("#hero-image");
    const heroScene = chapter.scenes[1] || chapter.scenes[0];
    hero.setAttribute("aria-label", chapter.titleUa);
    hero.style.backgroundImage = chapter.model
      ? `linear-gradient(0deg,rgba(10,29,27,.84) 0%,rgba(10,29,27,0) 58%),url('${relative(heroScene.image)}')`
      : `linear-gradient(90deg,rgba(255,249,237,.98) 0%,rgba(255,249,237,.9) 34%,rgba(255,249,237,.14) 66%),url('${relative(heroScene.image)}')`;

    const { audio, seek, player } = refs();
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
    refs().card.classList.toggle("translation-off", !state.translation);
    document.querySelector("#translation-toggle").classList.toggle("active", state.translation);
    document.querySelector("#autoscroll-toggle").classList.toggle("active", state.autoScroll);

    renderScenes();
    renderStory();
    renderNextChapter();
    updateAt(0);
  }

  function chapterProgressKey() {
    return `loop-reader:${state.chapter.slug}:time`;
  }

  async function loadChapter(slug, userInitiated = false) {
    try {
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
    audio.currentTime = start;
    updateAt(start);
    audio.play().catch(() => {});
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
      if (state.autoScroll && active && !audio.paused) active.scrollIntoView({ behavior: "smooth", block: "center" });
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

  function bindEvents() {
    const { audio, play, player, seek } = refs();
    document.querySelector("#back-to-contents").addEventListener("click", () => showContents(true));
    document.querySelector("#header-translation").addEventListener("click", toggleTranslation);
    document.querySelector("#translation-toggle").addEventListener("click", toggleTranslation);
    document.querySelector("#autoscroll-toggle").addEventListener("click", (event) => {
      state.autoScroll = !state.autoScroll;
      event.currentTarget.classList.toggle("active", state.autoScroll);
    });
    play.addEventListener("click", () => audio.paused ? audio.play().catch(() => {}) : audio.pause());
    document.querySelector("#speed-button").addEventListener("click", (event) => {
      const index = speeds.indexOf(state.speed);
      state.speed = speeds[(index + 1) % speeds.length];
      audio.playbackRate = state.speed;
      event.currentTarget.textContent = `${state.speed}×`;
    });
    seek.addEventListener("input", (event) => {
      audio.currentTime = Number(event.currentTarget.value);
      updateAt(audio.currentTime);
    });
    audio.addEventListener("play", () => { player.classList.add("playing"); play.setAttribute("aria-label", "Пауза"); });
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
      if (event.code === "Space" && !["INPUT", "BUTTON"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        audio.paused ? audio.play().catch(() => {}) : audio.pause();
      }
    };
  }

  function showError(message, error) {
    console.error(error);
    app.innerHTML = `<section class="error-card"><span class="brand-mark">L</span><h1>Щось пішло не так</h1><p>${message}</p></section>`;
  }

  async function init() {
    try {
      const response = await fetch("data/chapters.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.chapters = await response.json();
      const hash = location.hash.slice(1);
      const initial = state.chapters.find((item) => item.slug === hash)?.slug;
      if (initial) await loadChapter(initial);
      else showContents(false);

      window.addEventListener("popstate", () => {
        const target = state.chapters.find((item) => item.slug === location.hash.slice(1));
        if (target) loadChapter(target.slug, false);
        else showContents(false);
      });
    } catch (error) {
      showError("Не вдалося завантажити дані плеєра. Спробуйте оновити сторінку.", error);
    }
  }

  init();
})();
