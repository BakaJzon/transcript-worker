import OpenAI from "openai";

const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>字幕转文稿</title>
<style>
/* (Previous styles remain unchanged) */
body {
	font-family: sans-serif;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	min-height: 100vh;
	margin: 0;
	background-color: #f0f0f0;
}

.container {
	width: 80%;
	max-width: 800px;
	padding: 20px;
	box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
	background-color: white;
	border-radius: 8px;
}

h1 {
	text-align: center;
	margin-bottom: 20px;
}

#io-container {
display: flex;
gap: 20px;
margin-bottom: 10px;
}

.io-panel {
	flex: 1;
	display: flex;
	flex-direction: column;
}

.io-panel label {
	margin-bottom: 5px;
	font-weight: bold;
}

.io-panel textarea {
	width: 100%;
	height: 300px;
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
justify-content: center;
gap: 10px;
margin-bottom: 20px;
flex-wrap: wrap; /* Allow buttons to wrap on smaller screens */
}

#settings {
margin-bottom: 20px;
}

#settings details {
margin-bottom: 10px;
}

#download-section {
display: flex;
align-items: center;
gap: 10px;
justify-content: center; /* Center download controls */
}

#downloadFilename {
width: 100px; /* Adjust as needed */
}

.hidden {
	display: none;
}

/* Style for visually hidden file input */
#fileInput {
width: 0.1px;
height: 0.1px;
opacity: 0;
overflow: hidden;
position: absolute;
z-index: -1;
}

/* Style for the import button to look like a regular button */
#importButton {
/* Same styles as other buttons */
background-color: #4CAF50;
color: white;
padding: 10px 15px;
border: none;
border-radius: 4px;
cursor: pointer;
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
<input type="file" id="fileInput" accept=".txt,.ass,.srt,.vtt" class="hidden">
<button id="importButton">导入</button>
<select id="conversionType">
<option value="none">不转换</option>
<option value="srt">SRT</option>
<option value="vtt">VTT</option>
<option value="ass">ASS</option>
<option value="txt">TXT</option>
</select>
<button id="convertButton">转换</button>
<button id="startButton">开始</button>
<button id="stopButton" disabled>中断</button>
<div id="download-section">
<input type="text" id="downloadFilename" value="script" placeholder="文件名">
<button id="downloadButton">输出下载</button>
</div>
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
const fileInput = document.getElementById('fileInput');
const importButton = document.getElementById('importButton'); // Import button
const convertButton = document.getElementById('convertButton');
const conversionType = document.getElementById('conversionType');
const downloadButton = document.getElementById('downloadButton');
const downloadFilename = document.getElementById('downloadFilename');
let abortController = null;

// --- Utility Functions ---

function parseSRT(text) {
	const lines = text.trim().split('\\n');
	let result = '';
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === '' || !isNaN(parseInt(lines[i]))) {
			continue; // Skip empty lines and sequence numbers
		}
		if (lines[i].includes('-->')) {
			continue; // Skip timestamp lines
		}
		result += lines[i].trim() + '\\n';
	}
	return result.trim();
}

function parseVTT(text) {
	const lines = text.trim().split('\\n');
	let result = '';
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === '' || lines[i].startsWith('WEBVTT') || lines[i].includes('-->')) {
			continue; // Skip empty lines, WEBVTT header, and timestamp lines
		}
		result += lines[i].trim() + '\\n';
	}
	return result.trim();
}

function parseASS(text) {
	const lines = text.trim().split('\\n');
	let result = '';
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith('Dialogue:')) {
			const parts = lines[i].split(',');
			if (parts.length > 9) {
				result += parts.slice(9).join(',').trim() + '\\n'; // Extract text after the 9th comma
			}
		}
	}
	return result.replace(/\\{[^}]+\\}/g, '').trim(); // Remove ASS tags like {\\pos(x,y)}
	}


	function convertSubtitles(text, type) {
		switch (type) {
			case 'srt':
				return parseSRT(text);
			case 'vtt':
				return parseVTT(text);
			case 'ass':
				return parseASS(text);
			case 'txt':
				return text; // For TXT, no conversion needed
			default:
				return text;
		}
	}

	// --- Drag and Drop ---
	inputArea.addEventListener('dragover', (event) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
	});

	inputArea.addEventListener('drop', async (event) => {
		event.preventDefault();
		const file = event.dataTransfer.files[0];
		if (file) {
			await handleFile(file);
		}
	});

	// --- File Input (Import Button) ---
	importButton.addEventListener('click', () => {
		fileInput.click(); // Trigger the file input
	});

	fileInput.addEventListener('change', async () => {
		if (fileInput.files.length > 0) {
			await handleFile(fileInput.files[0]);
			fileInput.value = ''; // Clear the file input
		}
	});


	async function handleFile(file) {
		const text = await file.text();
		const fileExtension = file.name.split('.').pop().toLowerCase();

		if (['srt', 'vtt', 'ass', 'txt'].includes(fileExtension)) {
			const convertedText = convertSubtitles(text, fileExtension);
			inputArea.value = convertedText;
		}  else {
			alert('不支持的文件格式。请使用 .txt, .srt, .vtt, 或 .ass 文件。');
		}
	}


	// --- URL Import ---
	async function importFromURL(url) {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(\`HTTP error! status: \${response.status}, URL: \${url}\`);
			}
			const text = await response.text();
			// Try to guess the subtitle format from the URL
			const urlLower = url.toLowerCase();
			let format = 'none';
			if (urlLower.endsWith('.srt')) {
				format = 'srt';
			} else if (urlLower.endsWith('.vtt')) {
				format = 'vtt';
			} else if (urlLower.endsWith('.ass')) {
				format = 'ass';
			} else if (urlLower.endsWith('.txt')) {
				format = 'txt';
			}

			inputArea.value = convertSubtitles(text, format);

		} catch (error) {
			alert("URL导入失败: " + error);
			console.error('Error fetching from URL:', error);
		}
	}


	// --- Convert Button ---
	convertButton.addEventListener('click', () => {
		const text = inputArea.value;
		const type = conversionType.value;
		inputArea.value = convertSubtitles(text, type);
	});

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

	// --- Download Button ---
	downloadButton.addEventListener('click', () => {
		const textToDownload = outputArea.value;
		const filename = downloadFilename.value.trim() || 'script'; // Use default if empty
		const blob = new Blob([textToDownload], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = filename + '.txt';
		document.body.appendChild(a); // Required for Firefox
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url); // Clean up
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
			temp: env.MODEL_TEMPERATURE || 0.6,
			max_tokens: env.MODEL_MAX_TOKENS || 8192,
			max_rounds: 10,
			systemPrompt:
`你是一个视频文稿助手，任务是将视频的字幕重新组织为原来的文稿。
请按以下要求对字幕进行处理：

1. **忠于原文**：请确保转换后的文本忠实于原文的意思，不要改变或添加原始内容。
2. **删除冗余的语气词**：删除所有不必要的语气词和填充词（例如：“嗯”、“啊”、“就”、“那个”、“像是说”、“so”、“that”、“其实”等），使文本更加简洁。
3. **处理广告部分**：如果字幕中包含广告内容，请删除。
4. **标点符号**：补充适当的标点符号（如句号、逗号、引号等），以确保语句的语法正确。
5. **分段**：重新分段，按传统文章的格式分段，每段应包含一个观点或事件，而非单个标点符号分段。相反地，多个事件请分多段，即使段落本身不长。一段不超过5句话。
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
					// top_p: 0.8,
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

						if (finished || text.includes("<end/>")) {
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
