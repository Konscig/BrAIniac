import getExpress from 'express';
import { JudgeAgent } from '../services/judge/judge.agent.service';
import { judgeToolHandlers } from '../services/judge/judge.toolsHandlers';

const router = getExpress.Router();
const agent = new JudgeAgent();

router.post("/api/judge/chat", async (req, res) => {
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