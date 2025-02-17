import OpenAI from "openai";

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
					if(finished) break; // in case that for...await is not break
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
				headers: { 'Content-Type': 'text/plain; charset=utf-8' },
			});
		}

		return new Response('Method not allowed', { status: 405 });
	},
};
