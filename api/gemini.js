export default async function handler(req, res) {
  // 1. 設定 CORS (允許前端呼叫)
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. 從 Vercel 環境變數拿鑰匙 (記得去 Vercel 設定 GEMINI_API_KEY)
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Server Configuration Error: Missing Gemini API Key" });
  }

  // 3. 取得前端傳來的 Prompt
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  try {
    // 4. 呼叫 Google Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();
    
    // 5. 回傳結果給前端
    res.status(200).json(data);

  } catch (error) {
    console.error("Gemini Backend Error:", error);
    res.status(500).json({ error: "Failed to fetch from Gemini" });
  }
}
