import OpenAI from "openai";

const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>字幕转文稿</title>
<style>
body {
	font-family: sans-serif;
	display: flex;
	flex-direction: column;
	align-items: center; /* Center horizontally */
	justify-content: center; /* Center vertically */
	min-height: 100vh; /* Ensure full viewport height */
	margin: 0; /* Remove default body margin */
	background-color: #f0f0f0; /* Light gray background */
}

.container {
	width: 60%; /* Or any desired width */
	padding: 20px;
	box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); /* Subtle shadow */
	background-color: white;
	border-radius: 8px; /* Rounded corners */
}

h1 {
	text-align: center;
	margin-bottom: 20px;
}

#io-container {
display: flex;
gap: 20px; /* Space between input and output */
margin-bottom: 10px;
}

.io-panel {
	flex: 1; /* Equal width for input and output */
	display: flex;
	flex-direction: column;
}

.io-panel label {
	margin-bottom: 5px;
	font-weight: bold;
}

.io-panel textarea {
	width: 100%;
	height: 400px; /* Increased height */
	padding: 10px;
	box-sizing: border-box;
	border: 1px solid #ccc;
	resize: vertical;
}

#outputArea {
overflow-y: scroll;
white-space: pre-wrap;
}

#controls {
display: flex;
justify-content: center; /* Center buttons */
gap: 10px;
margin-bottom: 20px;
}

#settings {
margin-bottom: 20px;
}

#settings details {
margin-bottom: 10px;
}

.hidden {
	display: none;
}
</style>
</head>
<body>

<div class="container">
<h1>字幕转文稿</h1>

<div id="settings">
<details>
<summary>设置</summary>
<label for="apiUrl">API 地址:</label>
<input type="text" id="apiUrl" value="__API_URL__" placeholder="例如：/api">
</details>
</div>

<div id="controls">
<button id="startButton">开始</button>
<button id="stopButton" disabled>中断</button>
</div>

<div id="io-container">
<div class="io-panel">
<label for="inputArea">字幕 (支持拖拽或粘贴):</label>
<textarea id="inputArea" placeholder="请在此处输入字幕..."></textarea>
</div>

<div class="io-panel">
<label for="outputArea">文稿:</label>
<textarea id="outputArea" readonly></textarea>
</div>
</div>
</div>

<script>
const apiUrlInput = document.getElementById('apiUrl');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const inputArea = document.getElementById('inputArea');
const outputArea = document.getElementById('outputArea');
let abortController = null;

// --- Drag and Drop ---
inputArea.addEventListener('dragover', (event) => {
	event.preventDefault();
	event.dataTransfer.dropEffect = 'copy';
});

inputArea.addEventListener('drop', async (event) => {
	event.preventDefault();
	const file = event.dataTransfer.files[0];
	if (file) {
		const text = await file.text();
		inputArea.value = text;
	}
});

// --- URL Import ---
async function importFromURL(url) {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(\`HTTP error! status: \${response.status}, URL: \${url}\`);
		}
		const text = await response.text();
		inputArea.value = text;
	} catch (error) {
		alert("URL导入失败: " + error);
		console.error('Error fetching from URL:', error);
	}
}

// --- Start Processing ---
startButton.addEventListener('click', async () => {
	const subtitles = inputArea.value.trim();
	if (!subtitles) {
		alert('请输入字幕!');
		return;
	}

	const apiUrl = apiUrlInput.value.trim() || '/api'; // Use default if empty.
	outputArea.value = ''; // Clear previous output
	startButton.disabled = true;
	stopButton.disabled = false;
	abortController = new AbortController();

	try {
		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'text/plain',
			},
			body: subtitles,
			signal: abortController.signal, // Pass the abort signal
		});

		if (!response.ok) {
			throw new Error(\`HTTP error! status: \${response.status}\`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder('utf-8');

		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			const decodedChunk = decoder.decode(value, { stream: true });
			outputArea.value += decodedChunk;
			outputArea.scrollTop = outputArea.scrollHeight; // Auto-scroll
		}

	} catch (error) {
		if (error.name === 'AbortError') {
			outputArea.value += "\\n已中断";
			console.log('Fetch aborted');
		} else {
			outputArea.value += \`\\nError: \${error.message}\`;
			console.error('Error during fetch:', error);
			alert("发生错误: " + error);
		}
	} finally {
		startButton.disabled = false;
		stopButton.disabled = true;
		abortController = null;
	}
});

// --- Stop Processing ---
stopButton.addEventListener('click', () => {
	if (abortController) {
		abortController.abort();
	}
});

// --- URL Input ---
const url = new URL(window.location.href);
const urlParam = url.searchParams.get("url");
if (urlParam) {
	importFromURL(urlParam);
}

</script>
</body>
</html>
`;


export default {
	async fetch(request, env, ctx) {
		const config = {
			apiKey: env.OPENAI_API_KEY,
			baseURL: env.OPENAI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
			model: env.OPENAI_MODEL || 'qwen-turbo-latest',
			temp: env.MODEL_TEMPERATURE || 0.4,
			max_tokens: env.MODEL_MAX_TOKENS || 6400,
			max_rounds: 3,
			systemPrompt:
`你是一个视频文稿助手，任务是将视频的字幕重新组织为原来的文稿。
请按以下要求对字幕进行处理：

1. **忠于原文**：请确保转换后的文本忠实于原文的意思，不要改变或添加原始内容。
2. **删除冗余的语气词**：删除所有不必要的语气词和填充词（例如：“嗯”、“啊”、“就”、“那个”、“像是说”、“so”、“that”、“其实”等），使文本更加简洁。
3. **处理广告部分**：如果字幕中包含广告内容，请删除。
4. **标点符号**：补充适当的标点符号（如句号、逗号、引号等），以确保语句的语法正确。
5. **分段**：重新分段，按传统文章的格式分段，每段应包含一个完整的观点或事件，而非单个标点符号分段。
6. **修正错误**：字幕文件可能包含语音识别错误（如错字、缺字等），你需要根据上下文修正这些错误。
7. **输出结束标记**：在转换后的文本末尾输出 \`<end/>\`，表示文稿输出完成。如果因单轮回答超过上限也不要自行压缩语句，而是通过多轮对话完成。

强调：请确保转换后的文本忠实于原文的意思，不要改变或添加原始内容。你的任务**不是**总结文稿，只是恢复没有排版的字幕。
只输出修正后的文本，不需要任何解释。`,
		};


		if (request.method === 'GET') {
			// Get the request URL
			const url = new URL(request.url);
			// Construct the API URL based on the request URL
			const apiUrl = url.pathname === "/" ? url.origin :  url.origin + url.pathname;

			// Replace the placeholder in the HTML with the dynamic API URL
			const modifiedHtml = htmlContent.replace('__API_URL__', apiUrl);

			return new Response(modifiedHtml, {
				headers: { 'Content-Type': 'text/html; charset=utf-8' },
			});
		}



		if (request.method === 'POST') {
			const subtitles = await request.text();

			const openai = new OpenAI({
				apiKey: config.apiKey,
				baseURL: config.baseURL,
			});

			let conversationHistory = [
				{ role: "system", content: config.systemPrompt },
				{ role: "user", content: subtitles },
			];
			let rounds = 0;

			const { readable, writable } = new TransformStream();
			const writer = writable.getWriter();
			const encoder = new TextEncoder();

			// Function to handle a single completion, stream the response, and check for <end/>.
			async function handleCompletion(messages) {
				const completion = await openai.chat.completions.create({
					messages: messages,
					model: config.model,
					temperature: config.temp,
					max_tokens: config.max_tokens,
					stream: true,
				});

				let accumulatedText = "";
				let finished = false;

				for await (const chunk of completion) {
					const [choice] = chunk.choices;
					const { content } = choice.delta;
					if (content) {
						if (content.includes("<end/>")) {
							// Extract text before <end/> and stream it.
							const endIndex = content.indexOf("<end/>");
							const textBeforeEnd = content.substring(0, endIndex);
							accumulatedText += textBeforeEnd;
							await writer.write(encoder.encode(textBeforeEnd));
							finished = true;
							break; // Exit the loop immediately after encountering <end/>
						} else {
							accumulatedText += content;
							await writer.write(encoder.encode(content));
						}
					}
					if (finished) break; // in case that for...await is not break
				}

				if (!finished) {
					await writer.write(encoder.encode("\n")); // Newline only if not finished.
				}

				return { text: accumulatedText, finished }; // Return both text and finished status.
			}

			// Asynchronously process the completions in the background
			(async () => {
				try {
					while (rounds < config.max_rounds) {
						const { text, finished } = await handleCompletion(conversationHistory);

						if (finished || text.indexOf("<end/>")) {
							break;
						}

						conversationHistory = [
							...conversationHistory,
							{ role: "assistant", content: text },
							{ role: "user", content: "continue" },
						];
						rounds++;
					}
				} catch (error) {
					console.error("Error during streaming:", error);
					await writer.write(encoder.encode(`\nError: ${error.message}\n`));
				} finally {
					writer.close();
				}
			})();

			return new Response(readable, {
				headers: { 'Content-Type': 'text/stream; charset=utf-8' },
			});
		}

		return new Response('Method not allowed', { status: 405 });
	},
};
