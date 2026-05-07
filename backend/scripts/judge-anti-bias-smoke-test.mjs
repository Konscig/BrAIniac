#!/usr/bin/env node
/**
 * FR-028: если JUDGE_PROVIDER выдаёт модель из семейства OPENROUTER_LLM_MODEL,
 * среда должна предупредить пользователя о возможном self-preference bias.
 *
 * MVP: проверяется только наличие warning в логах / metadata. Задача-stub:
 * реальная реализация warning'а добавляется в JudgeAssessment.summary_json
 * отдельной итерацией.
 */
console.log('[judge:anti-bias] smoke пока декларативный. Заглушка для FR-028.');
console.log('[judge:anti-bias] TODO: после добавления self-preference warning в summary_json');
console.log('[judge:anti-bias] этот скрипт должен проверять, что summary.warnings содержит');
console.log('[judge:anti-bias] "self_preference_risk", когда семейства совпадают.');
