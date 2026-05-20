import { RhvoiceWebTts, synthResultToWav } from "./sdk/index.js";

const tts = new RhvoiceWebTts();
let initPromise = null;
let currentAudio = null;

function normalizeRequest(input) {
  if (typeof input === "string") {
    return {
      text: input,
      locale: document.documentElement.lang || navigator.language || "en",
    };
  }

  return {
    locale: document.documentElement.lang || navigator.language || "en",
    ...input,
  };
}

async function init() {
  if (!initPromise) {
    initPromise = tts.init();
  }
  return initPromise;
}

async function synthesize(input) {
  await init();
  return tts.synthesize(normalizeRequest(input));
}

async function createAudio(input) {
  const result = await synthesize(input);
  const url = URL.createObjectURL(synthResultToWav(result));
  const audio = new Audio(url);
  audio.addEventListener(
    "ended",
    () => {
      URL.revokeObjectURL(url);
    },
    { once: true },
  );
  return { audio, result };
}

async function speak(input) {
  const { audio, result } = await createAudio(input);
  if (currentAudio) {
    currentAudio.pause();
    if (currentAudio.src.startsWith("blob:")) {
      URL.revokeObjectURL(currentAudio.src);
    }
  }
  currentAudio = audio;
  await audio.play();
  return result;
}

function dispose() {
  if (currentAudio) {
    currentAudio.pause();
    if (currentAudio.src.startsWith("blob:")) {
      URL.revokeObjectURL(currentAudio.src);
    }
    currentAudio = null;
  }
  tts.dispose();
  initPromise = null;
}

const api = {
  ready: init(),
  init,
  synthesize,
  createAudio,
  speak,
  ensureLocale(locale) {
    return init().then(() => tts.ensureLocale(locale));
  },
  getConfig() {
    return tts.getConfig();
  },
  getSnapshot() {
    return tts.getSnapshot();
  },
  dispose,
};

globalThis.RHVoiceWeb = api;

api.ready
  .then(() => {
    globalThis.dispatchEvent(new CustomEvent("rhvoice:ready", { detail: api }));
  })
  .catch((error) => {
    globalThis.dispatchEvent(new CustomEvent("rhvoice:error", { detail: error }));
  });

export default api;
