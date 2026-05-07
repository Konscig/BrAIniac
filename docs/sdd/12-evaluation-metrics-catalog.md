# Каталог Метрик Оценки и Методология Их Взвешивания

## Назначение
Документ фиксирует глобальный пул метрик `M`, правила выбора подмножества `M' ⊆ M` и методологию назначения весов `W` для оценки агентных пайплайнов BrAIniac, согласованные с математической постановкой задачи оценки конфигурации агента.

## Граница Документа
- Документ описывает метрики оценки поведения агентов и их узлов.
- Документ не описывает runtime-путь исполнения (см. `./09-backend-runtime-truth-snapshot.md`).
- Документ не описывает каталог runtime-нод (см. `./07-mvp-node-catalog.md`).
- Документ не описывает каталог инструментов (см. `./08-rag-toolkit.md`).
- Документ не является контрактом публичного API (см. `./11-backend-contract-freeze.md`).

## Связь с Математической Постановкой
- Агент: `a = ⟨V_a, E_a, C_a⟩`.
- Эталонный набор: `D = {(x_k, y_k)}_{k=1}^m`.
- Глобальный пул метрик: `M = {f_1, ..., f_t}`.
- Подмножество для агента: `M' ⊆ M`, `|M'| = p`.
- Веса: `W = {w_1, ..., w_p}`, `Σw_j = 1`.
- Среднее значение метрики на датасете: `S_j = (1/m) · Σ_{k=1}^m f_j(a(x_k), y_k)`.
- Итоговая оценка: `S = Σ_{j=1}^p w_j · S_j`.
- Операционные ограничения: `T(a)`, `C(a)`, `R_fail(a)`.
- Пороги интерпретации: `α < 0.6` — доработка; `0.6 ≤ α ≤ 0.8` — удовлетворительно; `α > 0.8` — проход.

## Топология Графа и Двухуровневая Семантика Циклов
- Математическая постановка оценки формулирует ограничение целостности через ациклический направленный граф, тогда как конституция графа BrAIniac (`./02-graph-constitution.md`) допускает управляемые циклы (Bounded Directed Graph) при наличии loop-policy и `maxIterations ≥ 1`.
- Этот документ трактует ограничение целостности в расширенной форме: `G` — связный управляемый циклический направленный граф с единственным входом и выходом; каждый цикл имеет loop-policy; под-пайплайны иерархически ацикличны относительно материнского графа.
- Для ациклических конфигураций пайплайна все метрики, связанные с циклами, редуцируются к классическому случаю (значения на константах: `f_loop_term = 1`, `f_loop_budget = 1`, `f_iter_dispersion = 1`).
- Циклы допустимы на двух уровнях, что влияет на интерпретацию ряда метрик:
  - Уровень внешнего графа pipeline (Bounded Directed Graph): циклы между узлами допустимы только при наличии loop-policy. Метрики `f_loop_term`, `f_loop_budget`, `f_loop_conv`, `f_iter_dispersion`, `f_retry` работают на этом уровне.
  - Уровень внутреннего runtime узла AgentCall: bounded loop tool-calls не создаёт рёбер внешнего графа (см. `./01-domain-glossary.md`, принцип двухуровневой согласованности). Метрики `f_trajIoU`, `f_trajEM`, `f_planEff`, `f_redund`, `f_toolsel`, `f_argF1`, `f_node_cov` учитывают траекторию tool-calls внутри одного выполнения AgentCall.
- При оценке цикла на уровне графа целевые метрики качества (например, `f_faith`) агрегируются по итерациям цикла усреднением или выбором хвостового значения последней итерации.
- При оценке bounded runtime AgentCall применяется cycle-collapsed нормализация траектории — повторения внутри одной итерации цикла сжимаются перед сравнением с эталоном.

## Нормативные Требования к Метрикам
- M1: каждая метрика MUST быть нормализована на отрезок `[0, 1]`.
- M2: каждая метрика MUST быть выразима как `f_j(a(x_k), y_k) → [0, 1]`.
- M3: для каждого экземпляра агента среда MUST уметь автоматически предложить начальный `M'_0` по ролям узлов.
- M4: веса `W` MUST удовлетворять условию `Σw_j = 1` и MUST быть интерпретируемыми.
- M5: результаты прогонов SHOULD логироваться с достаточной гранулярностью для последующей объективной калибровки весов.
- M6: нормализационные параметры (min/max, перцентили) SHOULD быть версионированы вместе с профилем оценки.

## Таксономия Глобального Пула M
Пул организован по осям качества. Каждая ось покрывается как минимум одной метрикой; в конкретном `M'` для агента ось может быть покрыта несколькими метриками.

### Ось A. Корректность Финального Ответа
- `f_EM` — Exact Match после нормализации: `(1/m) · Σ 𝟙[a(x_k) == y_k]`.
- `f_F1` — Token-F1 по токенам ответа и эталона.
- `f_sim` — Semantic Similarity: `max(0, cos(E(a(x_k)), E(y_k)))`.
- `f_bert` — BERTScore-F1 с rescaling на отрезок `[0, 1]`.
- `f_corr` — Answer Correctness (Ragas): взвешенная комбинация семантической близости и фактологической F1.

### Ось B. Грунтованность Ответа
- `f_faith` — Faithfulness (Ragas): `|claims_supported_by_ctx| / |claims_total|`.
- `f_fact` — FActScore: `|atoms_supported| / |atoms_total|`.
- `f_selfcheck` — SelfCheckGPT: внутренняя согласованность N сэмплов через NLI.
- `f_cite` — Citation F1: гармоническое среднее Citation Precision и Citation Recall в ALCE-постановке.
- `f_contra` — Contradiction Rate: `1 − доля_противоречий_NLI`.

### Ось C. Retrieval-Качество
- `f_recall@k` — Recall@k: `|Rel ∩ Top-k| / |Rel|`.
- `f_prec@k` — Precision@k.
- `f_mrr` — Mean Reciprocal Rank первого релевантного документа.
- `f_ndcg@k` — `DCG@k / IDCG@k`.
- `f_map` — Mean Average Precision.
- `f_hit@k` — бинарная индикация попадания релевантного документа в Top-k.
- `f_ctx_prec` — Context Precision (Ragas).
- `f_ctx_rec` — Context Recall (Ragas).

### Ось D. Tool-Use и Траектория
- `f_toolsel` — Tool Selection Accuracy: `(1/N) · Σ 𝟙[tool_pred == tool_gt]`.
- `f_argF1` — Parameter F1 на уровне AST-match аргументов вызова.
- `f_tool_ok` — Tool Call Success Rate: `|success| / |total|`.
- `f_trajIoU` — Trajectory IoU lenient: `|pred ∩ gt| / |pred ∪ gt|` на мультимножестве tool-calls; корректен для циклических траекторий.
- `f_trajEM` — Trajectory Exact Match на cycle-collapsed последовательности: повторения tool-calls внутри одной итерации цикла сжимаются перед сравнением с эталоном.
- `f_planEff` — Plan Efficiency: `min(1, steps_opt / steps_act)`, где `steps_opt` учитывает ожидаемое число итераций из loop-policy цикла, а не абстрактный оптимум.
- `f_redund` — Intra-Iteration Redundancy Penalty: `1 − (|unique_useful_calls_per_iter| / |total_calls_per_iter|)`, усреднённая по итерациям цикла. Повторения между итерациями bounded-цикла не штрафуются.
- `f_success` — Task Success Rate по env-specific checker.
- `f_passK` — pass^k: доля задач, решённых во всех `k` повторных прогонах.
- `f_node_cov` — Node Coverage: `|V_visited_unique| / |V_a|`; доля уникальных узлов графа, реально использованных при исполнении.

### Ось E. Структура Вывода
- `f_schema` — Schema Validity Rate: `|valid_outputs| / |total|` по JSON-Schema.
- `f_field` — Field-level F1 по полям структурированного ответа.
- `f_TED` — Normalized Tree Edit Distance: `1 − TED / max_tree_size`.
- `f_type` — Type Conformance Rate.

### Ось F. Control-Flow и Bounded Runtime
- `f_branch` — Correct Branching Rate на размеченных примерах.
- `f_loop_term` — Loop Termination Rate: `|runs_terminated_naturally| / |total|`.
- `f_retry` — Retry Efficacy: `|recovered_after_retry| / |initial_failures|`.
- `f_loop_budget` — Loop Budget Compliance: `1 − (|runs_hit_maxIter| / |total|)`; мера того, насколько часто цикл упирается в `maxIterations` вместо естественного выхода по `stopCondition`. Низкое значение указывает на недостаточность loop-policy или некорректный `stopCondition`.
- `f_loop_conv` — Loop Convergence Quality: доля прогонов, в которых целевая метрика качества (например, `f_faith`) монотонно улучшается между соседними итерациями цикла. Оценивает, что цикл реально улучшает результат, а не осциллирует.
- `f_iter_dispersion` — Iteration Count Dispersion: нормализованная стабильность динамики цикла, `max(0, 1 − σ(iter_count) / σ_ref)`, где `σ_ref` — референтная дисперсия из калибровочного датасета.

### Ось G. LLM-as-a-Judge
- `f_judge_ref` — Reference-based rubric (Prometheus-2, G-Eval): нормирование `(s − 1) / (scale − 1)`.
- `f_check` — CheckEval: `(1/|C|) · Σ c_i` по чек-листу булевых критериев.
- `f_judge_coh` — Coherence под G-Eval рубрикой.
- `f_judge_flu` — Fluency под G-Eval рубрикой.

### Ось H. Safety и Robustness
- `f_safe` — `1 − max(Detoxify, LlamaGuard)`.
- `f_refuse` — Refusal Quality: `0.5 · (TPR_harmful + TNR_benign)`.
- `f_consist` — Self-consistency: majority-vote agreement на `n ≥ 3` прогонах.
- `f_paraph` — Paraphrase invariance: `mean sim(a(x), a(p(x)))`.

## Сопоставление Узел → Стартовое Подмножество M'

Таблица определяет рекомендованное стартовое подмножество метрик для каждого типа узла и инструмента. Итоговое `M'_0` агента формируется как объединение по всем присутствующим в графе узлам с последующей дедупликацией.

| Узел или инструмент | Рекомендованное подмножество | Требует reference |
|---|---|---|
| Trigger, ManualInput, DatasetInput | — (только операционные метрики) | — |
| PromptBuilder | `f_schema`, `f_TED` | нет |
| LLMCall | `f_EM`, `f_F1`, `f_sim`, `f_judge_ref`, `f_judge_coh`, `f_judge_flu` | частично |
| LLMAnswer | `f_faith`, `f_corr`, `f_sim`, `f_cite`, `f_fact` | да |
| AgentCall | `f_success`, `f_passK`, `f_toolsel`, `f_argF1`, `f_trajIoU`, `f_planEff`, `f_redund`, `f_node_cov`, `f_judge_ref`, `f_consist`, `f_loop_budget` | да |
| ToolNode | `f_tool_ok`, `f_argF1`, `f_schema` | частично |
| DocumentLoader | ops: Coverage, Ingestion Success | нет |
| Chunker | `f_recall@k` downstream, chunk boundary heuristic | частично |
| Embedder | `f_ndcg@k` downstream, MTEB-proxy | да |
| VectorUpsert | ops: Coverage, Duplication Rate | нет |
| QueryBuilder | `f_sim` для reformulation, downstream `f_recall@k` | частично |
| HybridRetriever | `f_recall@k`, `f_mrr`, `f_ndcg@k`, `f_ctx_prec`, `f_ctx_rec`, `f_hit@k` | да |
| Reranker | `f_ndcg@k` delta, `f_map`, `f_ctx_prec` | да |
| ContextAssembler | `f_ctx_prec`, context utilization | частично |
| CitationFormatter | `f_cite` Precision, Recall, F1 | да |
| Parser | `f_schema`, `f_field`, `f_TED` | да |
| Filter, Ranker | `f_prec@k`, `f_recall@k`, `f_ndcg@k` | да |
| GroundingChecker | `f_faith`, `f_contra`, support coverage | нет |
| OutputValidator | `f_schema`, `f_type` | нет |
| Branch | `f_branch` | да |
| Merge | `f_ndcg@k` для ranking-merge, consensus | частично |
| RetryGate | `f_retry`, retry overhead | нет |
| LoopGate | `f_loop_term`, `f_loop_budget`, `f_loop_conv`, `f_iter_dispersion` | нет |
| SaveResult, Notify, Export | ops: Delivery Success Rate | нет |

## Методология Выбора Подмножества M'

### Шаг 1. Rule-Based Baseline M'_0
- Формируется как объединение рекомендованных подмножеств по всем узлам графа агента.
- Проверяется покрытие обязательных осей: Correctness, Grounding (при наличии контекстного пути), Tool-Use (при наличии AgentCall), Structure (при structured output), Safety.
- Каждая обязательная ось MUST иметь хотя бы одну метрику в `M'_0`.
- Baseline детерминирован и воспроизводим: два агента с одинаковой архитектурой графа получают одинаковый `M'_0`.

### Шаг 2. Data-Driven Прунинг
- Активируется при накоплении `N ≥ 50` прогонов агента на датасете `D`.
- Корреляционная фильтрация Spearman `ρ(S_i, S_j) > 0.9` внутри одной оси качества.
- При превышении порога одна из пары метрик помечается кандидатом на удаление.
- Удаление MUST NOT нарушать покрытие осей из шага 1.
- Опционально: LASSO или Elastic Net поверх линейной модели `S = Σ w_j S_j` против human-labels; метрики с `|w| ≈ 0` — кандидаты на удаление.

### Шаг 3. Интерпретируемость Выбора
- Для каждой метрики в `M'` SHOULD быть зафиксировано основание включения: origin-узел и ось качества.
- Для апостериорной атрибуции вклада метрик на отдельных прогонах применяется SHAP (Shapley values), не используемый как способ назначения весов.

## Методология Назначения Весов W

### Гибридный Подход AHP + CRITIC
Итоговый вес вычисляется как выпуклая комбинация субъективного и объективного весов:
```
w_j = λ · w_j^AHP + (1 − λ) · w_j^CRITIC,   Σw_j = 1
```
- `λ = 0.7` по умолчанию при малом объёме прогонов.
- `λ → 0.3–0.5` по мере роста `N` (при `N > 200`), отражая рост доверия данным.

### Субъективный Вес w_j^AHP
- Метод Analytic Hierarchy Process (Saaty, 1980).
- Шкала попарных сравнений `1–9`.
- Веса — нормированный главный собственный вектор матрицы попарных сравнений.
- Consistency Ratio: `CR = (λ_max − n) / ((n − 1) · RI)`, требование `CR < 0.1`.
- При `n > 7` допускается замена AHP на Best-Worst Method (Rezaei, 2015): требует `2n − 3` сравнений вместо `n(n − 1)/2`.
- Шаблоны матриц сравнений привязаны к архитектурному классу агента:
  - RAG-агент: `faithfulness > answer_relevancy ≈ answer_correctness > retrieval > style`.
  - Tool-use агент: `task_success > tool_selection ≈ param_F1 > trajectory > style`.
  - Extractor-агент: `schema_validity > field_F1 > latency > style`.
  - Judge-агент: `consistency > refusal_quality > safety`.

### Объективный Вес w_j^CRITIC
- Метод Criteria Importance Through Intercriteria Correlation (Diakoulaki et al., 1995).
- Рассчитывается на корпусе прогонов `D × a`:
```
C_j = σ(S_j) · Σ_k (1 − ρ(S_j, S_k))
w_j^CRITIC = C_j / Σ_i C_i
```
- Преимущество CRITIC над entropy weighting: одновременно учитывает дисперсию метрики и её корреляцию с другими метриками.

### Pairwise Preference Для A/B Сравнения Конфигов
- При сравнении двух конфигураций одного агента применяется Bradley-Terry или Elo-рейтинг на парных предпочтениях судьи, а не усреднение `S`.

## Нормализация Метрик на Отрезок [0, 1]
- Ограниченные метрики (accuracy, F1, BERTScore, cosine similarity): без преобразования.
- Неограниченные метрики (latency, cost, tokens, TED): inverse min-max с перцентильным клиппингом по p5 и p95:
```
S_norm = clip((x_max − x) / (x_max − x_min), 0, 1)
```
- Тяжёлохвостые распределения: z-score с последующей логистической функцией.
- Параметры `x_min`, `x_max`, `p5`, `p95` MUST фиксироваться на калибровочном датасете и версионироваться вместе с профилем оценки.

## Операционные Ограничения и Жёсткий Гейт
- Операционные метрики не входят в `S`. Они образуют отдельный гейт, проверяемый поверх пороговой оценки `α`.
- `T(a)`: p95 задержки (не среднее).
- `C(a)`: `Σ_nodes (tokens_in · price_in + tokens_out · price_out) + tool_fees`.
- `R_fail(a)`: доля неуспешных прогонов с таксономией по классам отказа:
  - timeout
  - tool error
  - parsing violation
  - budget exhaustion
  - hallucinated tool
  - infinite loop
  - safety abort
- Итоговый жёсткий гейт:
```
pass ⟺ S ≥ α_pass
     ∧ R_fail(a) ≤ R_fail_max
     ∧ p95(T(a)) ≤ T_max
     ∧ C(a) ≤ C_max
     ∧ f_safe ≥ 0.95
```

## Обоснование Порогов α
Пороги не являются фиксированными константами и MUST выводиться одним из трёх методов:
- Percentile-based: `α = 0.6` как 50–60-й перцентиль `S` на human-labelled корпусе acceptable; `α = 0.8` как 80-й перцентиль на корпусе excellent.
- ROC-based: точка максимума Youden's J `(TPR − FPR)` при наличии бинарной разметки acceptable / not.
- Human-anchored: `α` как значение `S`, при котором `≥ 80%` прогонов отмечены человеком как приемлемые.

## Валидация Профиля (M', W, α)
- Мета-метрика согласованности с человеком: Kendall τ или Spearman ρ между `S` и усреднённой человеческой оценкой.
- Целевое значение `τ ≥ 0.4` в соответствии с практикой G-Eval и COMET.
- Inter-annotator agreement разметки: Cohen's κ или Krippendorff α `≥ 0.6`.
- Sensitivity analysis: ранжирование метрик по `|δS/δw_j| · σ(S_j)` для UI-объяснения вклада метрик.

## Переиспользуемые Фреймворки
| Фреймворк | Лицензия | Готовые метрики |
|---|---|---|
| Ragas | Apache-2.0 | faithfulness, answer_relevancy, answer_correctness, context_precision, context_recall |
| DeepEval | Apache-2.0 | GEval, ToolCorrectnessMetric, JsonCorrectnessMetric, HallucinationMetric, ContextualPrecision/Recall |
| TruLens | MIT | RAG Triad: Groundedness, Context Relevance, Answer Relevance |
| LangFuse | MIT | трассы, span-scoring, LLM-judge templates, автоматический учёт cost и latency |
| Arize Phoenix | ELv2 | prebuilt LLM evals, trace-level hallucination detection |
| Inspect AI | MIT | model_graded, tool_use solver, HarmBench интеграция |
| BFCL | open | AST-match для parameter accuracy |
| Vectara HHEM | open | быстрая NLI-based grounding без LLM-судьи |

- Все перечисленные фреймворки отдают значения метрик, либо нативно нормированные на `[0, 1]`, либо легко приводимые к `[0, 1]` через rescaling.
- В BrAIniac каждая `f_j` из `M` MAY быть обёрнута как прокси над метрикой соответствующего фреймворка при условии соответствия контракту `f_j(a(x_k), y_k) → [0, 1]`.

## Политика Судьи (Anti-Bias)
- Судейская модель SHOULD принадлежать иному семейству, чем оцениваемая модель (митигация self-preference).
- Для pairwise-сравнений MUST применяться рандомизация порядка и двойной прогон со сменой позиций (митигация position bias).
- Промпт судьи SHOULD явно инструктировать игнорировать длину ответа (митигация verbosity bias).
- При высоких требованиях к устойчивости применяется ансамбль нескольких дешёвых судей (PoLL).

## Жизненный Цикл Профиля Оценки
1. Построение `M'_0` по rule-based baseline из таблицы сопоставления.
2. Назначение стартовых весов `W_0` по AHP-шаблону архитектурного класса.
3. Установка порогов `α`, `T_max`, `C_max`, `R_fail_max` на калибровочном датасете.
4. Прогоны агента на `D`, логирование значений `S_j`, `T`, `C`, классов отказов.
5. При `N ≥ 50` — data-driven прунинг `M'` и CRITIC-коррекция `W`.
6. Пересчёт порогов `α` по перцентилям при значимом сдвиге распределения.
7. Версионирование профиля `(M', W, α, normalization_params)` вместе с конфигурацией агента.

## Ключевые Источники
- Saaty T.L., 1980. The Analytic Hierarchy Process. McGraw-Hill.
- Diakoulaki D., Mavrotas G., Papayannakis L., 1995. Determining objective weights in multiple criteria problems: The CRITIC method. Computers and Operations Research 22(7).
- Rezaei J., 2015. Best-worst multi-criteria decision-making method. Omega 53.
- Artstein R., Poesio M., 2008. Inter-Coder Agreement for Computational Linguistics. Computational Linguistics.
- Liang P. et al., 2022. Holistic Evaluation of Language Models (HELM). arXiv:2211.09110.
- Es S. et al., 2023. RAGAS: Automated Evaluation of Retrieval Augmented Generation. arXiv:2309.15217.
- Liu Y. et al., 2023. G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment. arXiv:2303.16634.
- Kim S. et al., 2024. Prometheus-2. arXiv:2405.01535.
- Lee Y. et al., 2024. CheckEval. arXiv:2403.18771.
- Verga P. et al., 2024. Replacing Judges with Juries (PoLL). arXiv:2404.18796.
- Panickssery A. et al., 2024. LLM Evaluators Recognize and Favor Their Own Generations. arXiv:2404.13076.
- Zheng L. et al., 2023. Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. arXiv:2306.05685.
- Chiang W.-L. et al., 2024. Chatbot Arena. arXiv:2403.04132.
- Liu X. et al., 2023. AgentBench. arXiv:2308.03688.
- Qin Y. et al., 2023. ToolBench. arXiv:2307.16789.
- Yao S. et al., 2024. τ-bench. arXiv:2406.12045.
- Ma X. et al., 2024. AgentBoard. arXiv:2401.13178.
- Mialon G. et al., 2023. GAIA. arXiv:2311.12983.
- Zhou S. et al., 2023. WebArena. arXiv:2307.13854.
- Jimenez C. et al., 2023. SWE-bench. arXiv:2310.06770.
- Min S. et al., 2023. FActScore. arXiv:2305.14251.
- Manakul P. et al., 2023. SelfCheckGPT. arXiv:2303.08896.
- Gao T. et al., 2023. Enabling Large Language Models to Generate Text with Citations (ALCE). arXiv:2305.14627.
- Thakur N. et al., 2021. BEIR. arXiv:2104.08663.
- Muennighoff N. et al., 2022. MTEB. arXiv:2210.07316.
- Zhang T. et al., 2019. BERTScore. arXiv:1904.09675.
- Lundberg S., Lee S., 2017. SHAP. NeurIPS.
- Saltelli A. et al., 2008. Global Sensitivity Analysis: The Primer. Wiley.
- Yehudai A. et al., 2025. Survey on Evaluation of LLM-based Agents. arXiv:2503.16416.
- Gu J. et al., 2024. Survey on LLM-as-a-Judge. arXiv:2411.15594.
- Inan H. et al., 2023. LlamaGuard. arXiv:2312.06674.
- Röttger P. et al., 2023. XSTest. arXiv:2308.01263.

## Связанные Документы
- `./01-domain-glossary.md` — глоссарий предметной области.
- `./03-node-role-profiles.md` — профили ролей узлов.
- `./07-mvp-node-catalog.md` — каталог runtime-нод.
- `./08-rag-toolkit.md` — каталог инструментов.
- `./11-backend-contract-freeze.md` — публичные контракты backend.
