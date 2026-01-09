export default async function handler(req, res) {
  // 1. 設定 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. 驗證金鑰
  const apiKey = process.env.GEMINI_API_KEY; 
  if (!apiKey) {
    console.error("Server Error: GEMINI_API_KEY is missing in environment variables.");
    return res.status(500).json({ error: "Server Configuration Error: Missing API Key" });
  }

  // 3. 取得並處理關鍵字
  const { keyword } = req.body;
  if (!keyword) {
    return res.status(400).json({ error: "Missing keyword" });
  }
  
  // 強制轉字串並移除過長內容，避免 Prompt 錯誤
  const safeKeyword = String(keyword).slice(0, 50);

  // 4. 定義風格咒語 (Prompt)
  const stylePrompt = `
    3D render of ${safeKeyword}, cute style.
    Appearance: Translucent frosted glass material, soft inner orange glow, minimalist, rounded edges.
    Background: Isolated on white.
    High quality, 8k resolution.
  `;

  try {
    // 5. 呼叫 Imagen 3.0 模型
    // 注意：如果您的帳號還不能用 3.0，這邊會報錯。
    const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`;
    
    const response = await fetch(googleUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: stylePrompt }],
          parameters: { sampleCount: 1, aspectRatio: "1:1" },
        }),
    });

    if (!response.ok) {
        // 捕捉並印出詳細錯誤，方便在 Vercel Logs 查看
        const errorText = await response.text();
        console.error(`Google Imagen API Error (${response.status}):`, errorText);
        throw new Error(`Google API Refused: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // 解析 Base64
    const base64Image = data.predictions?.[0]?.bytesBase64Encoded;
    
    if (!base64Image) {
        console.error("Google Response Data:", JSON.stringify(data));
        throw new Error("No image data found in Google response");
    }

    // 6. 成功！回傳圖片
    res.status(200).json({ imageUrl: `data:image/png;base64,${base64Image}` });

  } catch (error) {
    console.error("Backend Image Generation FAILED:", error);
    // 回傳 500 給前端，前端會保持原本的圓球，不會白畫面
    res.status(500).json({ error: "Image generation failed", details: error.message });
  }
}
