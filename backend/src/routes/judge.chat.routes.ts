import getExpress from 'express';
import { JudgeAgent } from '../services/judge/judge.agent.service.js';
import { judgeToolHandlers } from '../services/judge/judge.toolsHandlers.js';

const router = getExpress.Router();
const agent = new JudgeAgent();

router.post("/judge/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });

    const reply = await agent.chat(message);

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

export default router;

router.get("/judge/history", (req, res) => {
  try {
    const history = agent.getHistory();
    res.json({ history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});