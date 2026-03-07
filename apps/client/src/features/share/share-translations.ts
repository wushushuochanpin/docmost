import { useCallback } from "react";

const DEFAULT_SHARE_MESSAGES = {
  "404 page not found": "404 page not found",
  "Sorry, we can't find the page you are looking for.":
    "Sorry, we can't find the page you are looking for.",
  "Take me back to homepage": "Take me back to homepage",
  "Incorrect password": "Incorrect password",
  "Share link has expired": "Share link has expired",
  "Ask the owner to regenerate a new link.":
    "Ask the owner to regenerate a new link.",
  "Use full share link": "Use full share link",
  "This shared page requires the full link with share ID.":
    "This shared page requires the full link with share ID.",
  "Password required": "Password required",
  "Enter the password to access this shared page.":
    "Enter the password to access this shared page.",
  Password: "Password",
  "Verify password": "Verify password",
  "Unable to load shared page": "Unable to load shared page",
  "Error fetching page data.": "Error fetching page data.",
  untitled: "untitled",
  "Too many attempts. Please try again later.":
    "Too many attempts. Please try again later.",
  "Failed to verify share password": "Failed to verify share password",
  "Regenerate share link": "Regenerate share link",
  "Sidebar toggle": "Sidebar toggle",
  Search: "Search",
  "Table of contents": "Table of contents",
  "Toggle Color Scheme": "Toggle Color Scheme",
  "Close sidebar": "Close sidebar",
  "Close table of contents": "Close table of contents",
  "No table of contents.": "No table of contents.",
  "Open preview": "Open preview",
  "Load {{provider}} preview": "Load {{provider}} preview",
  "Preview is unavailable for this embed.":
    "Preview is unavailable for this embed.",
  "Load preview": "Load preview",
  "Open original": "Open original",
  "Close preview": "Close preview",
  "Loading remaining content...": "Loading remaining content...",
  "Page failed to load": "Page failed to load",
  Reload: "Reload",
} as const;

type ShareMessageKey = keyof typeof DEFAULT_SHARE_MESSAGES;
type ShareMessageValues = Record<string, string | number>;
type ShareLocale =
  | "en-US"
  | "de-DE"
  | "es-ES"
  | "fr-FR"
  | "it-IT"
  | "ja-JP"
  | "ko-KR"
  | "nl-NL"
  | "pt-BR"
  | "ru-RU"
  | "uk-UA"
  | "zh-CN";

const SHARE_MESSAGES: Partial<
  Record<ShareLocale, Partial<Record<ShareMessageKey, string>>>
> = {
  "de-DE": {
    "404 page not found": "404 Seite nicht gefunden",
    "Sorry, we can't find the page you are looking for.":
      "Entschuldigung, wir können die gesuchte Seite nicht finden.",
    "Take me back to homepage": "Zurück zur Startseite",
    Password: "Passwort",
    "Error fetching page data.": "Fehler beim Abrufen der Seitendaten.",
    untitled: "ohne Titel",
    "Sidebar toggle": "Seitenleiste umschalten",
    Search: "Suche",
    "Table of contents": "Inhaltsverzeichnis",
  },
  "es-ES": {
    "404 page not found": "404 página no encontrada",
    "Sorry, we can't find the page you are looking for.":
      "Lo sentimos, no podemos encontrar la página que buscas.",
    "Take me back to homepage": "Llévame de vuelta a la página de inicio",
    Password: "Contraseña",
    "Error fetching page data.": "Error al obtener los datos de la página.",
    untitled: "sin título",
    "Sidebar toggle": "Alternar barra lateral",
    Search: "Buscar",
    "Table of contents": "Índice de contenidos",
  },
  "fr-FR": {
    "404 page not found": "404 page non trouvée",
    "Sorry, we can't find the page you are looking for.":
      "Désolé, nous ne pouvons pas trouver la page que vous cherchez.",
    "Take me back to homepage": "Ramenez-moi à la page d'accueil",
    Password: "Mot de passe",
    "Error fetching page data.":
      "Erreur lors de la récupération des données de la page.",
    untitled: "sans titre",
    "Sidebar toggle": "Bascule de la barre latérale",
    Search: "Rechercher",
  },
  "it-IT": {
    "404 page not found": "404 pagina non trovata",
    "Sorry, we can't find the page you are looking for.":
      "Siamo spiacenti, non riusciamo a trovare la pagina che stai cercando.",
    "Take me back to homepage": "Torna all'homepage",
    "Error fetching page data.":
      "Si è verificato un errore durante il recupero dei dati della pagina.",
    untitled: "senza titolo",
    "Sidebar toggle": "Attiva/disattiva barra laterale",
    Search: "Cerca",
    "Table of contents": "Indice dei contenuti",
  },
  "ja-JP": {
    "404 page not found": "404 ページが見つかりません",
    "Sorry, we can't find the page you are looking for.":
      "お探しのページが見つかりません",
    "Take me back to homepage": "ホームに戻る",
    Password: "パスワード",
    "Error fetching page data.": "ページデータ取得中にエラーが発生しました。",
    untitled: "無題",
    "Sidebar toggle": "サイドバー切り替え",
    Search: "検索",
    "Table of contents": "目次",
  },
  "ko-KR": {
    "404 page not found": "404 페이지를 찾을 수 없음",
    "Sorry, we can't find the page you are looking for.":
      "죄송합니다. 페이지를 찾을 수 없습니다.",
    "Take me back to homepage": "홈페이지로 돌아가기",
    Password: "비밀번호",
    "Error fetching page data.": "페이지 데이터 불러오기 오류.",
    untitled: "제목 없음",
    "Sidebar toggle": "사이드바 전환",
    Search: "검색",
    "Table of contents": "목차",
  },
  "nl-NL": {
    "404 page not found": "404 pagina niet gevonden",
    "Sorry, we can't find the page you are looking for.":
      "Sorry, we kunnen de pagina die u zoekt niet vinden.",
    "Take me back to homepage": "Ga terug naar de homepage",
    Password: "Wachtwoord",
    "Error fetching page data.": "Fout bij het ophalen van paginagegevens.",
    untitled: "naamloos",
    "Sidebar toggle": "Zijbalk toggelen",
    Search: "Zoeken",
    "Table of contents": "Inhoudsopgave",
  },
  "pt-BR": {
    "404 page not found": "Erro 404: Página não encontrada",
    "Sorry, we can't find the page you are looking for.":
      "Desculpe, não conseguimos encontrar a página que você está procurando.",
    "Take me back to homepage": "Leve-me de volta para a página inicial",
    Password: "Senha",
    "Error fetching page data.": "Erro ao buscar dados da página.",
    untitled: "sem título",
    "Sidebar toggle": "Interruptor do painel lateral",
    Search: "Buscar",
    "Table of contents": "Tabela de conteúdos",
  },
  "ru-RU": {
    "404 page not found": "404 страница не найдена",
    "Sorry, we can't find the page you are looking for.":
      "К сожалению, мы не можем найти страницу, которую вы ищете.",
    "Take me back to homepage": "Вернуться на главную страницу",
    Password: "Пароль",
    "Error fetching page data.": "Ошибка при загрузке данных страницы.",
    untitled: "без названия",
    "Sidebar toggle": "Переключить боковую панель",
    Search: "Поиск",
    "Table of contents": "Содержание",
  },
  "uk-UA": {
    "404 page not found": "404 сторінку не знайдено",
    "Sorry, we can't find the page you are looking for.":
      "На жаль, ми не можемо знайти сторінку, яку ви шукаєте.",
    "Take me back to homepage": "Повернутися на головну сторінку",
    Password: "Пароль",
    "Error fetching page data.": "Помилка при завантаженні даних сторінки.",
    untitled: "без назви",
    "Sidebar toggle": "Перемкнути бічну панель",
    Search: "Пошук",
    "Table of contents": "Зміст",
  },
  "zh-CN": {
    "404 page not found": "404 页面未找到",
    "Sorry, we can't find the page you are looking for.":
      "抱歉，我们无法找到你所需要的页面",
    "Take me back to homepage": "回到主页",
    "Incorrect password": "密码错误",
    "Share link has expired": "分享链接已过期",
    "Ask the owner to regenerate a new link.": "请联系拥有者重新生成新链接。",
    "Use full share link": "请使用完整分享链接",
    "This shared page requires the full link with share ID.":
      "此共享页面需要包含 share ID 的完整链接。",
    "Password required": "需要密码",
    "Enter the password to access this shared page.":
      "输入密码以访问此共享页面。",
    Password: "密码",
    "Verify password": "验证密码",
    "Error fetching page data.": "获取页面数据时出错。",
    untitled: "无标题",
    "Too many attempts. Please try again later.": "尝试次数过多，请稍后重试。",
    "Failed to verify share password": "密码验证失败",
    "Regenerate share link": "重新生成分享链接",
    "Sidebar toggle": "切换侧边栏",
    Search: "搜索",
    "Table of contents": "目录",
    "Loading remaining content...": "正在加载剩余内容...",
    "Page failed to load": "页面加载失败",
    Reload: "重新加载",
  },
};

const SHARE_LOCALE_ALIASES: Record<string, ShareLocale> = {
  de: "de-DE",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  nl: "nl-NL",
  pt: "pt-BR",
  ru: "ru-RU",
  uk: "uk-UA",
  zh: "zh-CN",
};

function resolveShareLocale(rawLocale?: string | null): ShareLocale {
  const normalized = rawLocale?.trim();
  if (!normalized) {
    return "en-US";
  }

  const exactMatch = Object.keys({
    "de-DE": true,
    "en-US": true,
    "es-ES": true,
    "fr-FR": true,
    "it-IT": true,
    "ja-JP": true,
    "ko-KR": true,
    "nl-NL": true,
    "pt-BR": true,
    "ru-RU": true,
    "uk-UA": true,
    "zh-CN": true,
  }).find((locale) => locale.toLowerCase() === normalized.toLowerCase());

  if (exactMatch) {
    return exactMatch as ShareLocale;
  }

  const languageCode = normalized.split(/[-_]/)[0]?.toLowerCase();
  return SHARE_LOCALE_ALIASES[languageCode] ?? "en-US";
}

function getStoredShareLocale(): ShareLocale | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedLocale = window.localStorage.getItem("i18nextLng");
    return storedLocale ? resolveShareLocale(storedLocale) : null;
  } catch {
    return null;
  }
}

export function getCurrentShareLocale(): ShareLocale {
  const storedLocale = getStoredShareLocale();
  if (storedLocale) {
    return storedLocale;
  }

  if (typeof document !== "undefined") {
    const documentLocale = document.documentElement.lang;
    if (documentLocale) {
      return resolveShareLocale(documentLocale);
    }
  }

  if (typeof navigator !== "undefined") {
    for (const locale of navigator.languages || [navigator.language]) {
      if (locale) {
        return resolveShareLocale(locale);
      }
    }
  }

  return "en-US";
}

function formatShareMessage(
  template: string,
  values?: ShareMessageValues,
): string {
  if (!values) {
    return template;
  }

  return template.replace(/{{\s*([^}\s]+)\s*}}/g, (_, key: string) => {
    const value = values[key];
    return value == null ? "" : String(value);
  });
}

export function translateShareMessage(
  key: ShareMessageKey,
  values?: ShareMessageValues,
): string {
  const locale = getCurrentShareLocale();
  const message = SHARE_MESSAGES[locale]?.[key] ?? DEFAULT_SHARE_MESSAGES[key];
  return formatShareMessage(message, values);
}

export function useShareTranslation() {
  const t = useCallback(
    (key: ShareMessageKey, values?: ShareMessageValues) =>
      translateShareMessage(key, values),
    [],
  );

  return { t };
}
