/**
 * Константы и коды ошибок для тула RAG Dataset.
 *
 * Источник истины — feature spec 002-rag-dataset-tool.
 * См. specs/002-rag-dataset-tool/data-model.md и contracts/rag-dataset-tool-contract.md.
 */

export const RAG_DATASET_TOOL_NAME = 'rag-dataset';
export const RAG_DATASET_NODE_TYPE_NAME = 'RAGDataset';

/** 1 МБ ровно (1 048 576 байт) — лимит размера одного файла корпуса. */
export const RAG_DATASET_MAX_FILE_BYTES = 1_048_576;

/** Максимум файлов в одном узле RAG Dataset. */
export const RAG_DATASET_MAX_FILES_PER_NODE = 64;

/** Разрешённые расширения файлов корпуса (lowercase, с ведущей точкой). */
export const RAG_DATASET_ALLOWED_EXTENSIONS = ['.txt', '.sql', '.csv'] as const;

/** Префикс URI для управляемого хранилища RAG-корпуса. */
export const RAG_CORPUS_URI_PREFIX = 'workspace://backend/.artifacts/rag-corpus/';

/** Относительный путь хранилища (от repo root). */
export const RAG_CORPUS_STORAGE_RELATIVE_PATH = 'backend/.artifacts/rag-corpus';

/** Дискриминатор источника документа в выходе тула. */
export const RAG_CORPUS_DOCUMENT_SOURCE = 'rag-corpus';

/**
 * Коды ошибок RAG Dataset (для HttpError). Все сообщения — на русском (FR-015).
 */
export const RAG_DATASET_ERROR_CODES = {
  /** Конфигурация узла не содержит ни одного URI. */
  FILE_LIST_EMPTY: 'RAG_DATASET_FILE_LIST_EMPTY',
  /** В конфигурации узла превышен лимит количества файлов. */
  FILE_LIST_TOO_LONG: 'RAG_DATASET_FILE_LIST_TOO_LONG',
  /** URI не начинается с разрешённого префикса rag-corpus. */
  URI_INVALID: 'RAG_DATASET_URI_INVALID',
  /** Расширение файла не входит в whitelist (txt/sql/csv). */
  FORMAT_INVALID: 'RAG_DATASET_FORMAT_INVALID',
  /** Дубликат URI в списке файлов одного узла. */
  FILE_DUPLICATE: 'RAG_DATASET_FILE_DUPLICATE',
  /** Файл не найден на диске на момент исполнения. */
  FILE_NOT_FOUND: 'RAG_DATASET_FILE_NOT_FOUND',
  /** Размер файла превышает лимит 1 МБ. */
  SIZE_EXCEEDED: 'RAG_DATASET_SIZE_EXCEEDED',
  /** Файл не декодируется как UTF-8 (бинарный или повреждённый). */
  ENCODING_INVALID: 'RAG_DATASET_ENCODING_INVALID',
  /** Прочие проблемы при чтении файла (IO, права доступа). */
  FILE_READ_ERROR: 'RAG_DATASET_FILE_READ_ERROR',
  /** Имя файла при загрузке содержит запрещённые символы. */
  FILENAME_INVALID: 'RAG_CORPUS_FILENAME_INVALID',
  /** Невалидный base64 в content_base64 на загрузке. */
  CONTENT_INVALID: 'RAG_CORPUS_CONTENT_INVALID',
  /** Неизвестный kind в POST /datasets/upload. */
  INVALID_KIND: 'INVALID_KIND',
} as const;

export type RagDatasetErrorCode = (typeof RAG_DATASET_ERROR_CODES)[keyof typeof RAG_DATASET_ERROR_CODES];

/** Человекочитаемые сообщения об ошибках. */
export const RAG_DATASET_ERROR_MESSAGES: Record<RagDatasetErrorCode, string> = {
  [RAG_DATASET_ERROR_CODES.FILE_LIST_EMPTY]: 'Узел RAG Dataset должен содержать хотя бы один файл корпуса.',
  [RAG_DATASET_ERROR_CODES.FILE_LIST_TOO_LONG]: `Превышен лимит количества файлов в одном узле RAG Dataset (${RAG_DATASET_MAX_FILES_PER_NODE}).`,
  [RAG_DATASET_ERROR_CODES.URI_INVALID]: 'URI файла должен ссылаться на управляемое хранилище RAG-корпуса.',
  [RAG_DATASET_ERROR_CODES.FORMAT_INVALID]: `Поддерживаются только форматы ${RAG_DATASET_ALLOWED_EXTENSIONS.join(', ')}.`,
  [RAG_DATASET_ERROR_CODES.FILE_DUPLICATE]: 'Дубликат URI в списке файлов узла RAG Dataset.',
  [RAG_DATASET_ERROR_CODES.FILE_NOT_FOUND]: 'Файл корпуса не найден в хранилище.',
  [RAG_DATASET_ERROR_CODES.SIZE_EXCEEDED]: `Размер файла превышает лимит ${Math.round(RAG_DATASET_MAX_FILE_BYTES / 1024)} КБ (1 МБ).`,
  [RAG_DATASET_ERROR_CODES.ENCODING_INVALID]: 'Файл должен быть в кодировке UTF-8 (включая ASCII как подмножество).',
  [RAG_DATASET_ERROR_CODES.FILE_READ_ERROR]: 'Не удалось прочитать файл корпуса.',
  [RAG_DATASET_ERROR_CODES.FILENAME_INVALID]: 'Имя файла содержит запрещённые символы.',
  [RAG_DATASET_ERROR_CODES.CONTENT_INVALID]: 'Содержимое файла невалидно (ожидается base64).',
  [RAG_DATASET_ERROR_CODES.INVALID_KIND]: 'Неизвестное значение поля kind в /datasets/upload.',
};
