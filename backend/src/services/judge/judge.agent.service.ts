import { Mistral } from "@mistralai/mistralai";
import { judgeSystemPrompt } from "./judge.prompt.service";
import { tools } from "./judge.tools.service";
import { judgeToolHandlers } from "./judge.toolsHandlers";

const env = process.loadEnvFile(".env");

export class JudgeAgent {
   
    private client = new Mistral({
        apiKey: process.env.MISTRAL_API_KEY || "",
    });

    private history: Array<{ role: "user" | "assistant" | "system" | "tool"; content: string; name?: string }> = [];

    async chat(userMessage: string) {
        this.history.push({ role: "user", content: userMessage });

        const response = await this.client.chat.complete({
            model: "ministral-3b-2410",
            messages: [
                { role: "system", content: judgeSystemPrompt },
                ...this.history,
            ],
            tools: tools,
        });

        const msg = response.choices[0]?.message;
        if (msg?.toolCalls && msg.toolCalls.length > 0) {
            for (const toolCall of msg.toolCalls) {
                const handler = judgeToolHandlers[toolCall.function.name as keyof typeof judgeToolHandlers];
                if (!handler) continue;
                const toolResult = await handler({ id: toolCall.function.name });
                const toolFollowup = await this.client.chat.complete({
                    model: "ministral-3b-2410",
                    messages: [
                        { role: "system", content: judgeSystemPrompt },
                        ...this.history,
                        { 
                            role: "assistant", 
                            content: msg.content || "" ,
                        },
                        { 
                            role: "tool",
                            name: toolCall.function.name,
                            content: JSON.stringify(toolResult),
                        }, 
                    ],
                });
                return toolFollowup;
        }
    }
    return msg?.content;
  }

  getHistory() {
    return this.history;
  }
}