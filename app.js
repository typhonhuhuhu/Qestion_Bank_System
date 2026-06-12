const STORAGE_KEYS = {
  settings: 'aiQuestionBank.settings',
  sourceText: 'aiQuestionBank.sourceText',
  requirements: 'aiQuestionBank.requirements',
  questionBank: 'aiQuestionBank.questionBank',
  practiceResults: 'aiQuestionBank.practiceResults'
};

const state = {
  currentView: 'settings',
  settings: { apiBaseUrl: '', modelName: '', apiKey: '' },
  sourceText: '',
  requirements: { text: '', topic: '', counts: { single: 5, multiple: 3, short: 2, essay: 1 } },
  questionBank: null,
  activeFilter: 'all',
  practiceResults: {}
};

const viewIds = {
  settings: 'settings-view',
  source: 'source-view',
  requirements: 'requirements-view',
  knowledge: 'knowledge-view',
  practice: 'practice-view',
  results: 'results-view'
};

function getElement(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message, type = 'info') {
  const toast = getElement('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}


function navigateWithToast(viewName, message) {
  showToast(message, 'success');
  showView(viewName);
}

function showView(viewName) {
  Object.entries(viewIds).forEach(([name, id]) => {
    const view = getElement(id);
    view.hidden = name !== viewName;
  });
  state.currentView = viewName;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (viewName === 'knowledge') renderKnowledgePoints();
  if (viewName === 'practice') renderPractice();
  if (viewName === 'results') renderResults();
}

function safeJSONParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadState() {
  state.settings = { ...state.settings, ...safeJSONParse(localStorage.getItem(STORAGE_KEYS.settings), {}) };
  state.sourceText = localStorage.getItem(STORAGE_KEYS.sourceText) || '';
  state.requirements = { ...state.requirements, ...safeJSONParse(localStorage.getItem(STORAGE_KEYS.requirements), {}) };
  state.requirements.counts = { single: 5, multiple: 3, short: 2, essay: 1, ...(state.requirements.counts || {}) };
  state.questionBank = safeJSONParse(localStorage.getItem(STORAGE_KEYS.questionBank), null);
  state.practiceResults = safeJSONParse(localStorage.getItem(STORAGE_KEYS.practiceResults), {});
  hydrateForms();
}

function hydrateForms() {
  getElement('api-base-url').value = state.settings.apiBaseUrl || '';
  getElement('model-name').value = state.settings.modelName || '';
  getElement('api-key').value = state.settings.apiKey || '';
  getElement('source-text').value = state.sourceText || '';
  getElement('requirement-text').value = state.requirements.text || '';
  getElement('topic-input').value = state.requirements.topic || '';
  getElement('single-count').value = state.requirements.counts.single ?? 5;
  getElement('multiple-count').value = state.requirements.counts.multiple ?? 3;
  getElement('short-count').value = state.requirements.counts.short ?? 2;
  getElement('essay-count').value = state.requirements.counts.essay ?? 1;
}

function saveSettings() {
  const apiBaseUrl = getElement('api-base-url').value.trim();
  const modelName = getElement('model-name').value.trim();
  const apiKey = getElement('api-key').value.trim();
  if (!apiBaseUrl || !modelName || !apiKey) {
    showToast('请补全 API Base URL、模型名称和 API Key。', 'error');
    return;
  }
  state.settings = { apiBaseUrl, modelName, apiKey };
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  showToast('配置已保存。', 'success');
  setTimeout(() => showView('source'), 550);
}

function clearSettings() {
  state.settings = { apiBaseUrl: '', modelName: '', apiKey: '' };
  localStorage.removeItem(STORAGE_KEYS.settings);
  hydrateForms();
  showToast('API 配置已清空。', 'success');
}

function readRequirementsForm() {
  state.requirements = {
    text: getElement('requirement-text').value.trim(),
    topic: getElement('topic-input').value.trim(),
    counts: {
      single: normalizeCount(getElement('single-count').value),
      multiple: normalizeCount(getElement('multiple-count').value),
      short: normalizeCount(getElement('short-count').value),
      essay: normalizeCount(getElement('essay-count').value)
    }
  };
  localStorage.setItem(STORAGE_KEYS.requirements, JSON.stringify(state.requirements));
}

function normalizeCount(value) {
  const count = Number.parseInt(value, 10);
  if (Number.isNaN(count) || count < 0) return 0;
  return Math.min(count, 50);
}

function clearWorkspace() {
  state.sourceText = '';
  state.requirements = { text: '', topic: '', counts: { single: 5, multiple: 3, short: 2, essay: 1 } };
  state.questionBank = null;
  state.practiceResults = {};
  state.activeFilter = 'all';
  localStorage.removeItem(STORAGE_KEYS.sourceText);
  localStorage.removeItem(STORAGE_KEYS.requirements);
  localStorage.removeItem(STORAGE_KEYS.questionBank);
  localStorage.removeItem(STORAGE_KEYS.practiceResults);
  getElement('pdf-files').value = '';
  hydrateForms();
  showToast('工作区、题库和练习结果已清空，API 配置保留。', 'success');
}

function persistSourceText(text) {
  state.sourceText = text.trim();
  localStorage.setItem(STORAGE_KEYS.sourceText, state.sourceText);
}

async function parsePdfAndContinue() {
  const files = Array.from(getElement('pdf-files').files || []);
  const pastedText = getElement('source-text').value.trim();
  if (!files.length && !pastedText) {
    showToast('请先上传 PDF 或粘贴学习资料。', 'error');
    return;
  }
  if (!files.length) {
    persistSourceText(pastedText);
    showToast('已保存学习资料。', 'success');
    showView('requirements');
    return;
  }
  const button = getElement('parse-pdf-btn');
  setButtonLoading(button, true, '解析中...');
  try {
    if (!window.pdfjsLib) throw new Error('PDF 解析库加载失败，请检查网络或改为粘贴文本。');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const chunks = [];
    for (const file of files) {
      chunks.push(`\n【${file.name}】\n`);
      chunks.push(await extractTextFromPdf(file));
    }
    const mergedText = `${chunks.join('\n')}\n${pastedText}`.trim();
    if (!mergedText) throw new Error('没有从 PDF 中解析到可用文本。');
    getElement('source-text').value = mergedText;
    persistSourceText(mergedText);
    showToast('PDF 解析成功，学习资料已保存。', 'success');
    showView('requirements');
  } catch (error) {
    showToast(`PDF 解析失败：${error.message}。你可以复制 PDF 文本后粘贴到文本框。`, 'error');
  } finally {
    setButtonLoading(button, false);
  }
}

function extractTextFromPdf(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`无法读取文件 ${file.name}`));
    reader.onload = async () => {
      try {
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(reader.result) }).promise;
        const pages = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item) => item.str).join(' ');
          pages.push(`第 ${pageNumber} 页：${pageText}`);
        }
        resolve(pages.join('\n'));
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function useTextAndContinue() {
  const text = getElement('source-text').value.trim();
  if (!text && !(getElement('pdf-files').files || []).length) {
    showToast('请先上传 PDF 或粘贴学习资料。', 'error');
    return;
  }
  if (!text) {
    showToast('已检测到 PDF，请点击“解析 PDF 并继续”。', 'warning');
    return;
  }
  persistSourceText(text);
  showToast('已保存学习资料。', 'success');
  showView('requirements');
}

function isSettingsComplete() {
  return Boolean(state.settings.apiBaseUrl && state.settings.modelName && state.settings.apiKey);
}

function buildApiUrl() {
  const base = state.settings.apiBaseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

async function callChatCompletions(messages, temperature = 0.2) {
  const response = await fetch(buildApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.settings.apiKey}`
    },
    body: JSON.stringify({ model: state.settings.modelName, messages, temperature })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
  }
  const data = JSON.parse(text);
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 返回中没有 message.content。');
  return content;
}

async function generateQuestionBank() {
  readRequirementsForm();
  if (!isSettingsComplete()) {
    showToast('API 配置不完整，请返回 API 配置补全。', 'error');
    return;
  }
  if (!state.sourceText.trim()) {
    showToast('学习资料为空，请返回上传资料。', 'error');
    return;
  }
  const total = Object.values(state.requirements.counts).reduce((sum, count) => sum + count, 0);
  if (total <= 0) {
    showToast('请至少设置一种题型的数量大于 0。', 'error');
    return;
  }
  const button = getElement('generate-bank-btn');
  setButtonLoading(button, true, '正在生成...');
  try {
    const content = await callChatCompletions(buildGenerationMessages(), 0.35);
    const parsed = parseModelJSON(content);
    const valid = validateQuestionBank(parsed);
    state.questionBank = valid;
    state.practiceResults = {};
    localStorage.setItem(STORAGE_KEYS.questionBank, JSON.stringify(valid));
    localStorage.setItem(STORAGE_KEYS.practiceResults, JSON.stringify(state.practiceResults));
    showToast('题库生成成功。', 'success');
    showView('knowledge');
  } catch (error) {
    showToast(`生成失败：${error.message}`, 'error');
  } finally {
    setButtonLoading(button, false);
  }
}

function buildGenerationMessages() {
  const counts = state.requirements.counts;
  const schemaExample = {
    knowledgePoints: [
      {
        title: '知识点标题',
        summary: '知识点说明',
        sourceHint: '来自哪份资料、哪一页或原文线索'
      }
    ],
    questions: [
      {
        id: 'q1',
        type: 'single',
        stem: '题干，必须使用英文键名 stem，不要使用 question/title/content/text/prompt/题干/问题 等键名表示题干',
        options: [
          { label: 'A', text: '选项内容' },
          { label: 'B', text: '选项内容' },
          { label: 'C', text: '选项内容' },
          { label: 'D', text: '选项内容' }
        ],
        answer: 'A',
        explanation: '解析',
        knowledgePoint: '对应知识点',
        sourceHint: '资料来源线索',
        errorPoint: '常见错误点',
        relatedKnowledge: ['相关知识点'],
        difficulty: '基础'
      },
      {
        id: 'q2',
        type: 'multiple',
        stem: '题干，必须使用英文键名 stem',
        options: [
          { label: 'A', text: '选项内容' },
          { label: 'B', text: '选项内容' },
          { label: 'C', text: '选项内容' },
          { label: 'D', text: '选项内容' }
        ],
        answer: ['A', 'C'],
        explanation: '解析',
        knowledgePoint: '对应知识点',
        sourceHint: '资料来源线索',
        errorPoint: '常见错误点',
        relatedKnowledge: ['相关知识点'],
        difficulty: '提高'
      },
      {
        id: 'q3',
        type: 'short',
        stem: '题干，必须使用英文键名 stem',
        referenceAnswer: '参考答案',
        scoringPoints: [{ point: '采分点', score: 2 }],
        knowledgePoint: '对应知识点',
        sourceHint: '资料来源线索',
        errorPoint: '常见错误点',
        relatedKnowledge: ['相关知识点'],
        difficulty: '基础'
      },
      {
        id: 'q4',
        type: 'essay',
        stem: '题干，必须使用英文键名 stem',
        referenceAnswer: '参考答案',
        scoringPoints: [{ point: '采分点', score: 5 }],
        knowledgePoint: '对应知识点',
        sourceHint: '资料来源线索',
        errorPoint: '常见错误点',
        relatedKnowledge: ['相关知识点'],
        difficulty: '综合'
      }
    ]
  };
  const prompt = `请根据学习资料生成题库。必须只输出合法 JSON，不要输出 Markdown、解释或代码块。

硬性要求：
1. 必须返回英文键名 JSON，禁止使用中文键名。
2. 所有面向用户显示的内容必须使用简体中文，包括 knowledgePoints 的 title/summary/sourceHint，以及每道题的 stem、options[].text、explanation、referenceAnswer、scoringPoints[].point、knowledgePoint、sourceHint、errorPoint、relatedKnowledge、difficulty。
3. 如果学习资料是英文或其它语言，必须先理解资料，再将题干、选项、解析、参考答案和知识点翻译/改写成自然、准确的简体中文；必要时可在中文术语后保留英文术语括注，例如“标准误（standard error）”。
4. 不要输出英文整句题干或英文整句选项；除专有名词、公式、缩写和术语括注外，题目内容应为中文。
5. 每一道题必须使用英文键名 stem 表示题干；不要用 question、title、content、text、prompt、题干、问题 等键名表示题干。
6. 所有题目必须包含：id、type、stem、knowledgePoint、sourceHint、errorPoint、relatedKnowledge、difficulty。
7. 客观题 single 和 multiple 还必须包含：options、answer、explanation。
8. 主观题 short 和 essay 还必须包含：referenceAnswer、scoringPoints。
9. type 只能是 single、multiple、short、essay。
10. options 必须是对象数组，格式为 [{ "label": "A", "text": "选项内容" }]；不要返回纯字符串数组。
11. single 的 answer 必须是选项 label 字符串，例如 "A"；multiple 的 answer 必须是选项 label 字符串数组，例如 ["A", "C"]。
12. relatedKnowledge 必须是字符串数组；scoringPoints 必须是对象数组。
13. questions 必须是扁平题目数组，不要按题型分组，不要返回 { "single": [...] } 这类嵌套结构。

课程/主题：${state.requirements.topic || '未填写'}
出题需求：${state.requirements.text || '请覆盖核心知识点，难度适中'}
数量要求：单选 ${counts.single}，多选 ${counts.multiple}，简答 ${counts.short}，论述 ${counts.essay}。

请严格参考以下完整 JSON 示例的字段结构，替换为基于学习资料生成的内容：
${JSON.stringify(schemaExample, null, 2)}

学习资料：
${state.sourceText.slice(0, 52000)}`;
  return [
    { role: 'system', content: '你是严谨的中文大学课程助教。只返回可被 JSON.parse 解析的英文键名 JSON，但所有题目、选项、解析、参考答案和知识点内容必须使用简体中文。' },
    { role: 'user', content: prompt }
  ];
}

function parseModelJSON(content) {
  const trimmed = content.trim();
  const blockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidates = [trimmed];
  if (blockMatch) candidates.unshift(blockMatch[1].trim());
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  throw new Error('模型返回内容不是合法 JSON。');
}


function makeSafeQuestionId(rawId, index, usedIds) {
  const base = String(rawId || `q${index + 1}`).trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `q${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function getFirstNonEmpty(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
}

function getQuestionStemValue(question) {
  return getFirstNonEmpty(
    question.stem,
    question.question,
    question.title,
    question.text,
    question.content,
    question.prompt,
    question.questionText,
    question.question_text,
    question.stemText,
    question.stem_text,
    question.body,
    question.description,
    question.name,
    question.item,
    question.q,
    question['题干'],
    question['问题'],
    question['题目'],
    question['题目内容'],
    question['问题描述']
  );
}

function hasQuestionLikeFields(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  return Boolean(
    getQuestionStemValue(item) ||
    item.options ||
    item.选项 ||
    item.answer ||
    item.答案 ||
    item.referenceAnswer ||
    item.参考答案 ||
    item.scoringPoints ||
    item.采分点 ||
    item.knowledgePoint ||
    item.知识点
  );
}


function normalizeQuestionType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'single' || normalized.includes('single') || normalized.includes('单选')) return 'single';
  if (normalized === 'multiple' || normalized.includes('multiple') || normalized.includes('multi') || normalized.includes('多选')) return 'multiple';
  if (normalized === 'short' || normalized.includes('short') || normalized.includes('brief') || normalized.includes('简答')) return 'short';
  if (normalized === 'essay' || normalized.includes('essay') || normalized.includes('论述')) return 'essay';
  return normalized;
}

function inferTypeFromKey(key) {
  const normalized = String(key || '').toLowerCase();
  if (normalized.includes('multiple') || normalized.includes('multi') || normalized.includes('多选')) return 'multiple';
  if (normalized.includes('single') || normalized.includes('choice') || normalized.includes('单选')) return 'single';
  if (normalized.includes('short') || normalized.includes('brief') || normalized.includes('简答')) return 'short';
  if (normalized.includes('essay') || normalized.includes('论述')) return 'essay';
  return '';
}

function collectQuestionItems(source, inheritedType = '') {
  if (Array.isArray(source)) {
    return source.flatMap((item) => collectQuestionItems(item, inheritedType));
  }
  if (!source || typeof source !== 'object') return [];
  const directType = normalizeQuestionType(getFirstNonEmpty(source.type, source.类型) || inheritedType);
  const nestedKeys = [
    'questions',
    'questionList',
    'items',
    'list',
    'children',
    '题目',
    '题目列表',
    '单选题',
    '多选题',
    '简答题',
    '论述题',
    'single',
    'multiple',
    'short',
    'essay',
    'singleQuestions',
    'multipleQuestions',
    'shortQuestions',
    'essayQuestions',
    'singleChoiceQuestions',
    'multipleChoiceQuestions'
  ];
  const nestedItems = nestedKeys.flatMap((key) => {
    const value = source[key];
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => collectQuestionItems(item, inferTypeFromKey(key) || directType));
  });
  if (hasQuestionLikeFields(source)) {
    return [{ ...source, type: directType || source.type || source.类型 }];
  }
  return nestedItems;
}

function normalizeQuestionsSource(data) {
  const direct = Array.isArray(data.questions) || (data.questions && typeof data.questions === 'object')
    ? collectQuestionItems(data.questions)
    : [];
  if (direct.length) return direct;
  return collectQuestionItems({
    singleQuestions: data.singleQuestions || data.single || data['单选题'],
    multipleQuestions: data.multipleQuestions || data.multiple || data['多选题'],
    shortQuestions: data.shortQuestions || data.short || data['简答题'],
    essayQuestions: data.essayQuestions || data.essay || data['论述题']
  });
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
  return options.map((option, index) => {
    const fallbackLabel = labels[index] || String(index + 1);
    if (typeof option === 'string') {
      return { label: fallbackLabel, text: option.trim() };
    }
    if (!option || typeof option !== 'object') {
      return { label: fallbackLabel, text: '' };
    }
    return {
      label: getFirstNonEmpty(option.label, option.标签, option.key, option.name) || fallbackLabel,
      text: getFirstNonEmpty(option.text, option.content, option.内容, option.option, option.value, option.选项)
    };
  }).filter((option) => option.text);
}

function normalizeAnswer(answer, options, type) {
  const normalizeOne = (value) => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const directLabel = options.find((option) => option.label === text);
    if (directLabel) return directLabel.label;
    const caseInsensitiveLabel = options.find((option) => option.label.toLowerCase() === text.toLowerCase());
    if (caseInsensitiveLabel) return caseInsensitiveLabel.label;
    const matchedByText = options.find((option) => option.text.trim() === text);
    if (matchedByText) return matchedByText.label;
    const matchedByIncludedText = options.find((option) => option.text.includes(text) || text.includes(option.text));
    return matchedByIncludedText ? matchedByIncludedText.label : text;
  };
  if (type === 'multiple') {
    const values = Array.isArray(answer) ? answer : String(answer ?? '').split(/[、,，;；\s]+/).filter(Boolean);
    return values.map(normalizeOne).filter(Boolean);
  }
  return normalizeOne(answer);
}

function normalizeScoringPoints(scoringPoints) {
  if (!Array.isArray(scoringPoints)) return [];
  return scoringPoints.map((item, index) => {
    if (typeof item === 'string') {
      return { point: item, score: 0 };
    }
    if (!item || typeof item !== 'object') {
      return { point: `采分点 ${index + 1}`, score: 0 };
    }
    return {
      point: getFirstNonEmpty(item.point, item.采分点, item.text, item.content, item.内容) || `采分点 ${index + 1}`,
      score: Number(item.score ?? item.分值 ?? item.points ?? 0) || 0
    };
  });
}

function normalizeQuestion(question, index, usedIds) {
  const stem = getQuestionStemValue(question);
  if (!stem) {
    throw new Error(`第 ${index + 1} 道题缺少题干。`);
  }
  const type = normalizeQuestionType(getFirstNonEmpty(question.type, question.类型));
  const id = makeSafeQuestionId(question.id, index, usedIds);
  const options = normalizeOptions(question.options || question.选项 || []);
  const rawAnswer = question.answer ?? question.答案 ?? '';
  return {
    id,
    type,
    stem,
    options,
    answer: normalizeAnswer(rawAnswer, options, type),
    explanation: getFirstNonEmpty(question.explanation, question.解析),
    referenceAnswer: getFirstNonEmpty(question.referenceAnswer, question.参考答案, question.answerText, question.solution),
    scoringPoints: normalizeScoringPoints(question.scoringPoints || question.采分点),
    knowledgePoint: getFirstNonEmpty(question.knowledgePoint, question.知识点),
    sourceHint: getFirstNonEmpty(question.sourceHint, question.资料来源, question.来源) || '暂无来源线索',
    errorPoint: getFirstNonEmpty(question.errorPoint, question.易错点, question.错误点) || '暂无',
    relatedKnowledge: Array.isArray(question.relatedKnowledge || question.相关知识点) ? (question.relatedKnowledge || question.相关知识点) : [],
    difficulty: getFirstNonEmpty(question.difficulty, question.难度) || '未标注'
  };
}

function validateQuestionBank(data) {
  if (!data || !Array.isArray(data.knowledgePoints)) {
    throw new Error('题库 JSON 必须包含 knowledgePoints 数组。');
  }
  const questionItems = normalizeQuestionsSource(data);
  if (!questionItems.length) {
    throw new Error('题库 JSON 必须包含 questions 数组或可识别的题目列表。');
  }
  const allowedTypes = new Set(['single', 'multiple', 'short', 'essay']);
  const usedIds = new Set();
  const questions = questionItems.map((question, index) => {
    if (!question || typeof question !== 'object') throw new Error(`第 ${index + 1} 道题格式不合法。`);
    const normalized = normalizeQuestion(question, index, usedIds);
    if (!allowedTypes.has(normalized.type)) throw new Error(`第 ${index + 1} 道题 type 不合法。`);
    return normalized;
  });
  return {
    knowledgePoints: data.knowledgePoints.map((point) => ({
      title: getFirstNonEmpty(point?.title, point?.标题) || '未命名知识点',
      summary: getFirstNonEmpty(point?.summary, point?.说明) || '暂无说明',
      sourceHint: getFirstNonEmpty(point?.sourceHint, point?.来源, point?.资料来源) || '暂无来源线索'
    })),
    questions
  };
}

function setButtonLoading(button, isLoading, label) {
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function renderKnowledgePoints() {
  const list = getElement('knowledge-list');
  if (!state.questionBank) {
    list.innerHTML = '<div class="empty-state">还没有题库，请先生成或导入题库。</div>';
    return;
  }
  const points = state.questionBank.knowledgePoints || [];
  if (!points.length) {
    list.innerHTML = '<div class="empty-state">当前题库没有知识点，但仍可继续刷题。</div>';
    return;
  }
  list.innerHTML = points.map((point) => `
    <article class="info-card">
      <h3>${escapeHTML(point.title)}</h3>
      <p>${escapeHTML(point.summary)}</p>
      <p class="meta">资料来源线索：${escapeHTML(point.sourceHint)}</p>
    </article>
  `).join('');
}

function renderPractice() {
  const container = getElement('question-container');
  updateFilterButtons();
  if (!state.questionBank || !Array.isArray(state.questionBank.questions)) {
    container.innerHTML = '<div class="empty-state">还没有题库，请先生成或导入题库。</div>';
    return;
  }
  const questions = state.questionBank.questions.filter((question) => state.activeFilter === 'all' || question.type === state.activeFilter);
  if (!questions.length) {
    container.innerHTML = '<div class="empty-state">当前筛选下没有题目。</div>';
    return;
  }
  container.innerHTML = questions.map(renderQuestionCard).join('');
}

function renderQuestionCard(question) {
  const result = state.practiceResults[question.id];
  const typeName = getTypeName(question.type);
  const answerArea = question.type === 'single' || question.type === 'multiple'
    ? renderObjectiveOptions(question)
    : `<textarea id="answer-${escapeHTML(question.id)}" rows="5" placeholder="请输入你的答案">${escapeHTML(result?.userAnswer || '')}</textarea>`;
  const buttonText = question.type === 'single' || question.type === 'multiple' ? '提交本题' : '提交本题并 AI 阅卷';
  return `
    <article class="question-card" data-question-id="${escapeHTML(question.id)}">
      <span class="badge">${typeName}</span><span class="badge">${escapeHTML(question.difficulty || '未标注难度')}</span>
      <h3>${escapeHTML(question.stem)}</h3>
      ${answerArea}
      <div class="actions">
        <button class="primary-btn submit-question-btn" type="button" data-question-id="${escapeHTML(question.id)}">${buttonText}</button>
      </div>
      <div id="feedback-${escapeHTML(question.id)}" class="feedback-box" ${result ? '' : 'hidden'}>${result ? renderFeedback(question, result) : ''}</div>
    </article>
  `;
}

function renderObjectiveOptions(question) {
  const result = state.practiceResults[question.id];
  const saved = Array.isArray(result?.userAnswer) ? result.userAnswer : [result?.userAnswer].filter(Boolean);
  const inputType = question.type === 'single' ? 'radio' : 'checkbox';
  const name = `choice-${question.id}`;
  return (question.options || []).map((option) => {
    const checked = saved.includes(option.label) ? 'checked' : '';
    return `
      <label class="option-line">
        <input type="${inputType}" name="${escapeHTML(name)}" value="${escapeHTML(option.label)}" ${checked}>
        <span><strong>${escapeHTML(option.label)}.</strong> ${escapeHTML(option.text)}</span>
      </label>
    `;
  }).join('');
}

function renderFeedback(question, result) {
  const related = Array.isArray(question.relatedKnowledge) ? question.relatedKnowledge.join('、') : String(question.relatedKnowledge || '暂无');
  if (question.type === 'single' || question.type === 'multiple') {
    return `
      <p class="${result.correct ? 'correct' : 'incorrect'}">${result.correct ? '回答正确' : '回答错误'}</p>
      <p><strong>你的答案：</strong>${escapeHTML(formatAnswer(result.userAnswer))}</p>
      <p><strong>正确答案：</strong>${escapeHTML(formatAnswer(question.answer))}</p>
      <p><strong>解析：</strong>${escapeHTML(question.explanation || '暂无解析')}</p>
      <p><strong>错误点：</strong>${escapeHTML(question.errorPoint || '暂无')}</p>
      <p><strong>具体知识点：</strong>${escapeHTML(question.knowledgePoint || '暂无')}</p>
      <p><strong>资料来源：</strong>${escapeHTML(question.sourceHint || '暂无')}</p>
      <p><strong>相关题或相关知识点：</strong>${escapeHTML(related)}</p>
    `;
  }
  const breakdown = Array.isArray(result.pointBreakdown) ? result.pointBreakdown : [];
  return `
    <p class="${result.passed ? 'correct' : 'incorrect'}">得分：${escapeHTML(result.score)} / ${escapeHTML(result.totalScore)}</p>
    <p><strong>反馈：</strong>${escapeHTML(result.feedback || '暂无反馈')}</p>
    <p><strong>错误点：</strong>${escapeHTML(result.errorPoint || '暂无')}</p>
    <p><strong>采分点明细：</strong></p>
    <ul>${breakdown.map((item) => `<li>${escapeHTML(item.point)}：${escapeHTML(item.earned)} 分，${escapeHTML(item.comment)}</li>`).join('')}</ul>
    <p><strong>参考答案：</strong>${escapeHTML(question.referenceAnswer || '暂无')}</p>
    <p><strong>具体知识点：</strong>${escapeHTML(question.knowledgePoint || '暂无')}</p>
    <p><strong>资料来源：</strong>${escapeHTML(question.sourceHint || '暂无')}</p>
    <p><strong>相关题或相关知识点：</strong>${escapeHTML(related)}</p>
  `;
}

function getTypeName(type) {
  return { single: '单选', multiple: '多选', short: '简答', essay: '论述' }[type] || '题目';
}

function updateFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === state.activeFilter);
  });
}

function formatAnswer(answer) {
  return Array.isArray(answer) ? answer.join('、') : (answer || '未作答');
}

function findQuestion(questionId) {
  return state.questionBank?.questions?.find((question) => question.id === questionId);
}

async function submitQuestion(questionId, button) {
  const question = findQuestion(questionId);
  if (!question) {
    showToast('没有找到这道题，请刷新后重试。', 'error');
    return;
  }
  if (question.type === 'single' || question.type === 'multiple') {
    submitObjectiveQuestion(question);
    return;
  }
  await submitSubjectiveQuestion(question, button);
}

function submitObjectiveQuestion(question) {
  const selector = `input[name="choice-${CSS.escape(question.id)}"]:checked`;
  const selected = Array.from(document.querySelectorAll(selector)).map((input) => input.value);
  if (!selected.length) {
    showToast('请先选择答案。', 'error');
    return;
  }
  const userAnswer = question.type === 'single' ? selected[0] : selected.sort();
  const correct = compareAnswers(userAnswer, question.answer);
  state.practiceResults[question.id] = { type: question.type, userAnswer, correct, submittedAt: new Date().toISOString() };
  savePracticeResults();
  refreshQuestionFeedback(question.id);
  showToast(correct ? '本题回答正确。' : '本题已提交，请查看解析。', correct ? 'success' : 'warning');
}

function compareAnswers(userAnswer, correctAnswer) {
  const normalize = (answer) => (Array.isArray(answer) ? answer : [answer]).map(String).sort().join('|');
  return normalize(userAnswer) === normalize(correctAnswer);
}

async function submitSubjectiveQuestion(question, button) {
  if (!isSettingsComplete()) {
    showToast('API 配置不完整，请返回 API 配置补全后再阅卷。', 'error');
    return;
  }
  const answerInput = getElement(`answer-${question.id}`);
  const userAnswer = answerInput.value.trim();
  if (!userAnswer) {
    showToast('请先填写答案。', 'error');
    return;
  }
  setButtonLoading(button, true, '阅卷中...');
  try {
    const content = await callChatCompletions(buildGradingMessages(question, userAnswer), 0.1);
    const grading = parseModelJSON(content);
    const totalScore = Number(grading.totalScore ?? getTotalScore(question));
    const score = Number(grading.score ?? 0);
    state.practiceResults[question.id] = {
      type: question.type,
      userAnswer,
      score,
      totalScore,
      passed: score >= totalScore * 0.6,
      feedback: grading.feedback || '',
      errorPoint: grading.errorPoint || '',
      pointBreakdown: Array.isArray(grading.pointBreakdown) ? grading.pointBreakdown : [],
      submittedAt: new Date().toISOString()
    };
    savePracticeResults();
    refreshQuestionFeedback(question.id);
    showToast('AI 阅卷完成。', 'success');
  } catch (error) {
    showToast(`阅卷失败：${error.message}`, 'error');
  } finally {
    setButtonLoading(button, false);
  }
}

function buildGradingMessages(question, userAnswer) {
  return [
    { role: 'system', content: '你是严谨的中文大学课程阅卷老师。只返回合法 JSON，不要 Markdown；feedback、errorPoint、pointBreakdown.comment 等内容必须使用简体中文。' },
    {
      role: 'user',
      content: `请根据参考答案和采分点评阅学生答案，所有反馈内容必须使用简体中文，只输出 JSON：{ "score": 数字, "totalScore": 数字, "feedback": "反馈", "errorPoint": "主要错误点", "pointBreakdown": [{ "point": "采分点", "earned": 数字, "comment": "说明" }] }。\n题干：${question.stem}\n参考答案：${question.referenceAnswer || ''}\n采分点：${JSON.stringify(question.scoringPoints || [])}\n总分：${getTotalScore(question)}\n学生答案：${userAnswer}`
    }
  ];
}

function getTotalScore(question) {
  const points = Array.isArray(question.scoringPoints) ? question.scoringPoints : [];
  const total = points.reduce((sum, item) => sum + Number(item.score || 0), 0);
  return total > 0 ? total : (question.type === 'essay' ? 10 : 5);
}

function refreshQuestionFeedback(questionId) {
  const question = findQuestion(questionId);
  const result = state.practiceResults[questionId];
  const box = getElement(`feedback-${questionId}`);
  if (!question || !result || !box) return;
  box.innerHTML = renderFeedback(question, result);
  box.hidden = false;
}

function savePracticeResults() {
  localStorage.setItem(STORAGE_KEYS.practiceResults, JSON.stringify(state.practiceResults));
}

function renderResults() {
  const summary = getElement('results-summary');
  const weakBox = getElement('weak-points');
  const questions = state.questionBank?.questions || [];
  const results = Object.entries(state.practiceResults);
  const submittedCount = results.length;
  const passedCount = results.filter(([, result]) => result.correct || result.passed).length;
  const reviewCount = Math.max(0, submittedCount - passedCount);
  summary.innerHTML = `
    <div class="result-card"><h3>${submittedCount}</h3><p class="meta">已提交题目数</p></div>
    <div class="result-card"><h3>${passedCount}</h3><p class="meta">正确/通过题目数</p></div>
    <div class="result-card"><h3>${reviewCount}</h3><p class="meta">需复习题目数</p></div>
    <div class="result-card"><h3>${questions.length}</h3><p class="meta">题库总题数</p></div>
  `;
  const weakPoints = collectWeakPoints();
  weakBox.innerHTML = weakPoints.length
    ? `<h3>薄弱知识点</h3>${weakPoints.map((point) => `<article class="info-card"><strong>${escapeHTML(point.name)}</strong><p class="meta">需复习次数：${point.count}</p></article>`).join('')}`
    : '<div class="empty-state">暂无薄弱知识点。提交题目后会在这里汇总。</div>';
}

function collectWeakPoints() {
  const map = new Map();
  Object.entries(state.practiceResults).forEach(([questionId, result]) => {
    if (result.correct || result.passed) return;
    const question = findQuestion(questionId);
    const name = question?.knowledgePoint || '未标注知识点';
    map.set(name, (map.get(name) || 0) + 1);
  });
  return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function exportQuestionBank() {
  if (!state.questionBank) {
    showToast('没有可导出的题库。', 'error');
    return;
  }
  const blob = new Blob([JSON.stringify(state.questionBank, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `question-bank-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('题库 JSON 已开始下载。', 'success');
}

function openImportPicker(inputId) {
  const input = getElement(inputId);
  input.value = '';
  input.click();
}

function importQuestionBank(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => showToast('读取 JSON 文件失败。', 'error');
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || ''));
      const valid = validateQuestionBank(data);
      state.questionBank = valid;
      state.practiceResults = {};
      localStorage.setItem(STORAGE_KEYS.questionBank, JSON.stringify(valid));
      localStorage.setItem(STORAGE_KEYS.practiceResults, JSON.stringify(state.practiceResults));
      showToast('题库导入成功。', 'success');
      showView('knowledge');
    } catch (error) {
      showToast(`导入失败：${error.message}`, 'error');
    }
  };
  reader.readAsText(file);
}

function restartWorkspace() {
  clearWorkspace();
  showView('source');
}

function bindEvents() {
  getElement('save-settings-btn').addEventListener('click', saveSettings);
  getElement('clear-settings-btn').addEventListener('click', clearSettings);
  getElement('parse-pdf-btn').addEventListener('click', parsePdfAndContinue);
  getElement('use-text-btn').addEventListener('click', useTextAndContinue);
  getElement('back-to-settings-btn').addEventListener('click', () => navigateWithToast('settings', '已返回 API 配置。'));
  getElement('clear-workspace-btn').addEventListener('click', clearWorkspace);
  getElement('generate-bank-btn').addEventListener('click', generateQuestionBank);
  getElement('import-bank-btn').addEventListener('click', () => {
    showToast('请选择要导入的题库 JSON 文件。', 'info');
    openImportPicker('import-bank-file');
  });
  getElement('back-to-source-btn').addEventListener('click', () => navigateWithToast('source', '已返回上传资料。'));
  getElement('start-practice-btn').addEventListener('click', () => {
    if (!state.questionBank) {
      showToast('请先生成或导入题库。', 'error');
      return;
    }
    navigateWithToast('practice', '已进入刷题。');
  });
  getElement('back-to-requirements-btn').addEventListener('click', () => navigateWithToast('requirements', '已返回出题要求。'));
  getElement('show-results-btn').addEventListener('click', () => navigateWithToast('results', '已生成练习结果。'));
  getElement('back-to-knowledge-btn').addEventListener('click', () => navigateWithToast('knowledge', '已返回知识点确认。'));
  getElement('export-bank-btn').addEventListener('click', exportQuestionBank);
  getElement('import-bank-results-btn').addEventListener('click', () => {
    showToast('请选择要导入的题库 JSON 文件。', 'info');
    openImportPicker('import-bank-file-results');
  });
  getElement('back-to-practice-btn').addEventListener('click', () => navigateWithToast('practice', '已返回刷题。'));
  getElement('restart-btn').addEventListener('click', restartWorkspace);
  getElement('import-bank-file').addEventListener('change', importQuestionBank);
  getElement('import-bank-file-results').addEventListener('change', importQuestionBank);
  document.querySelectorAll('.filter-btn').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeFilter = button.dataset.filter;
      renderPractice();
      showToast(`已切换题型筛选：${button.textContent}`, 'success');
    });
  });
  getElement('question-container').addEventListener('click', (event) => {
    const button = event.target.closest('.submit-question-btn');
    if (!button) return;
    submitQuestion(button.dataset.questionId, button);
  });
}

function init() {
  loadState();
  bindEvents();
  showView('settings');
}

document.addEventListener('DOMContentLoaded', init);
