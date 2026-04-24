export type ReadableError = {
  title: string;
  message: string;
  raw?: unknown;
};

function stringifyError(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function readCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const record = error as Record<string, unknown>;
  const directCode = record.code;
  if (typeof directCode === "string") return directCode;
  const details = record.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const nestedCode = (details as Record<string, unknown>).code;
    if (typeof nestedCode === "string") return nestedCode;
  }
  return "";
}

export function toReadableError(error: unknown, fallback = "Не удалось выполнить действие."): ReadableError {
  const message = stringifyError(error) || fallback;
  const code = readCode(error);
  const haystack = `${code} ${message}`.toLowerCase();

  if (haystack.includes("invalid token") || haystack.includes("unauthorized") || haystack.includes("auth")) {
    return {
      title: "Проблема с токеном",
      message: "Проверьте токен или авторизацию провайдера модели.",
      raw: error
    };
  }

  if (haystack.includes("429") || haystack.includes("rate") || haystack.includes("quota")) {
    return {
      title: "Лимит провайдера",
      message: "Провайдер временно ограничил запросы. Подождите или смените модель/ключ.",
      raw: error
    };
  }

  if (haystack.includes("manualinput") || haystack.includes("input_required") || haystack.includes("non-empty input")) {
    return {
      title: "Не хватает вопроса",
      message: "Заполните вопрос пользователя в узле входа и повторите запуск.",
      raw: error
    };
  }

  if (haystack.includes("validation") || haystack.includes("graph")) {
    return {
      title: "Граф не прошел проверку",
      message: "Проверьте связи и обязательные настройки узлов.",
      raw: error
    };
  }

  if (haystack.includes("dataset") || haystack.includes("upload")) {
    return {
      title: "Проблема с dataset",
      message: "Проверьте выбранный файл или dataset и повторите действие.",
      raw: error
    };
  }

  if (haystack.includes("tool") || haystack.includes("config")) {
    return {
      title: "Проблема с инструментом",
      message: "Проверьте выбранный инструмент и настройки узла.",
      raw: error
    };
  }

  return {
    title: "Ошибка выполнения",
    message,
    raw: error
  };
}
