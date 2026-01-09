export default async function handler(req, res) {
  // 1. 設定 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. 取得關鍵字 (不再強制檢查 Gemini Key，因為我們改用 Pollinations)
  const { keyword } = req.body;
  if (!keyword) {
    return res.status(400).json({ error: "Missing keyword" });
  }
  
  const safeKeyword = String(keyword).slice(0, 50);
  const seed = Math.floor(Math.random() * 10000); // 隨機數，確保每次都有變化

  // 3. 定義風格咒語 (針對 Pollinations 優化)
  // Pollinations 懂很細的 Prompt，我們保留那個漂亮的玻璃質感描述
  const prompt = encodeURIComponent(`
    cute 3D icon of ${safeKeyword}, 
    style of glassmorphism, translucent frosted glass material, 
    soft inner warm orange glow, amber and peach color palette,
    minimalist, centered, isolated on white background, 
    high quality, 8k render, unreal engine 5, --no text
  `.replace(/\s+/g, " ").trim());

  try {
    // 4. 呼叫 Pollinations AI
    const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=512&height=512&seed=${seed}&nologo=true`;
    
    const response = await fetch(imageUrl);

    if (!response.ok) {
        throw new Error(`Pollinations API Error: ${response.status}`);
    }

    // 5. 取得圖片並轉為 Buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 6. 轉為 Base64 字串回傳
    const base64Image = `data:image/jpeg;base64,${buffer.toString('base64')}`;

    // 7. 成功！
    res.status(200).json({ imageUrl: base64Image });

  } catch (error) {
    console.error("Backend Image Generation FAILED:", error);
    res.status(500).json({ error: "Image generation failed", details: error.message });
  }
}
