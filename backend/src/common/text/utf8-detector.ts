/**
 * Утилита проверки валидности UTF-8.
 *
 * Принцип: при декодировании Buffer как 'utf8' Node заменяет инвалидные
 * последовательности на U+FFFD (replacement character). Если в исходных
 * байтах нет EF BF BD (последовательность для legitimate U+FFFD), но после
 * декодирования replacement-символ появился — значит, исходные байты не
 * валидный UTF-8.
 */

const REPLACEMENT_CHAR = '�';
const REPLACEMENT_BYTES = Buffer.from([0xef, 0xbf, 0xbd]); // U+FFFD в UTF-8

/**
 * Возвращает true, если буфер декодируется как валидный UTF-8.
 *
 * Учитывает edge case: если в исходных байтах присутствует legitimate
 * последовательность EF BF BD (т.е. сам символ U+FFFD), это не считается
 * ошибкой кодировки.
 */
export function isValidUtf8(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;

  const decoded = buffer.toString('utf8');
  const decodedReplacementCount = countOccurrences(decoded, REPLACEMENT_CHAR);
  if (decodedReplacementCount === 0) return true;

  // Допустимо, если ровно столько же legitimate U+FFFD было в исходных байтах.
  const sourceReplacementCount = countSubsequenceOccurrences(buffer, REPLACEMENT_BYTES);
  return decodedReplacementCount === sourceReplacementCount;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return count;
    count += 1;
    from = idx + needle.length;
  }
}

function countSubsequenceOccurrences(haystack: Buffer, needle: Buffer): number {
  if (needle.length === 0 || haystack.length < needle.length) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return count;
    count += 1;
    from = idx + needle.length;
  }
}
