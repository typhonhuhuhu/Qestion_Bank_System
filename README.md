# AI 题库生成与自测系统

一个可直接部署到 GitHub Pages 的纯静态前端复习工具。学生可以上传 PDF 或粘贴学习资料，填写出题要求，然后通过 OpenAI-compatible Chat Completions API 生成知识点和题库，并在浏览器中逐题自测、AI 阅卷与导出题库 JSON。

## 功能列表

- **沉浸式流程**：每次只展示当前任务，避免把配置、上传、生成、练习和结果堆在同一个长页面中。
- **API 配置本地保存**：支持填写任意 OpenAI-compatible API Base URL、模型名称和 API Key。
- **资料输入**：支持上传一个或多个 PDF，也支持直接粘贴教材、讲义、笔记等文本。
- **浏览器端 PDF 解析**：使用 pdf.js CDN 尽量在本地浏览器解析 PDF 文本。
- **AI 生成题库**：根据学习资料、课程主题、出题需求和题型数量生成知识点与题库 JSON。
- **导入已有题库**：可导入符合结构要求的 JSON 题库继续练习。
- **逐题练习**：支持单选、多选、简答、论述筛选与逐题提交。
- **客观题自动判分**：提交后立即显示你的答案、正确答案、解析、错误点、知识点、来源和相关知识。
- **主观题 AI 阅卷**：简答题和论述题调用用户配置的模型，根据参考答案和采分点评分。
- **结果汇总**：展示已提交题数、正确/通过题数、需复习题数和薄弱知识点。
- **导出题库**：将当前题库导出为带日期的 JSON 文件。
- **本地持久化**：使用 `localStorage` 保存 API 配置、学习资料、题库和练习结果。

## 使用方法

1. 打开网站后，先填写 API Base URL、模型名称和 API Key。
2. 上传 PDF 或粘贴学习资料文本。
3. 填写课程/主题、出题需求和题目数量。
4. 点击“生成题库”，等待模型返回题库 JSON。
5. 确认知识点后进入刷题。
6. 客观题选择答案后提交；主观题输入答案后提交并等待 AI 阅卷。
7. 完成练习后查看结果，也可以导出题库 JSON。

## 如何配置 API

本项目调用 OpenAI-compatible Chat Completions API。你需要准备：

- **API Base URL**：接口基础地址，例如 `https://api.openai.com/v1`。
- **模型名称**：例如 `gpt-4o-mini`、`deepseek-chat`。
- **API Key**：由服务商提供的密钥。

页面会把请求发送到：

```text
{API Base URL}/chat/completions
```

如果你填写的 Base URL 已经以 `/chat/completions` 结尾，系统会直接使用该地址。

## DeepSeek 示例配置

- API Base URL: `https://api.deepseek.com`
- 模型名称: `deepseek-chat`
- 高质量模型：`deepseek-reasoner`

也可以使用：

- API Base URL: `https://api.deepseek.com/v1`
- 模型名称: `deepseek-chat`

## 如何本地运行

本项目是纯静态文件，不需要构建步骤。进入项目目录后运行：

```bash
python -m http.server 8000
```

然后在浏览器打开：

```text
http://localhost:8000
```

> 建议通过本地 HTTP 服务访问，而不是直接双击 `index.html`，这样 PDF 解析和浏览器安全策略更稳定。

## 如何部署到 GitHub Pages

1. 将本仓库推送到 GitHub。
2. 打开仓库的 **Settings**。
3. 进入 **Pages**。
4. 在 **Build and deployment** 中选择从分支部署。
5. 选择主分支和根目录。
6. 保存后等待 GitHub Pages 生成访问地址。

由于项目只包含 `index.html`、`styles.css`、`app.js` 等静态资源，可以直接部署。

## API Key 安全提醒

- 不要把 API Key 写进代码。
- 不要把 API Key 提交到 GitHub。
- 本项目只把 API Key 保存在用户自己的浏览器 `localStorage` 中。
- 纯前端项目无法像后端服务那样隐藏 API Key；如果担心密钥暴露，请使用额度较低、权限受限或临时密钥。
- 在公共电脑上使用后，请点击“清空配置”并清理浏览器数据。

## 题库 JSON 结构

导入的 JSON 需要包含：

- `knowledgePoints`：知识点数组。
- `questions`：题目数组。

题目类型支持：

- `single`：单选题。
- `multiple`：多选题。
- `short`：简答题。
- `essay`：论述题。

客观题需要提供选项、答案和解析；主观题需要提供参考答案和采分点。

## 开源协议说明

本项目使用 MIT License。你可以自由使用、复制、修改、分发和部署本项目，但需要保留许可证声明。详见 [LICENSE](LICENSE)。
