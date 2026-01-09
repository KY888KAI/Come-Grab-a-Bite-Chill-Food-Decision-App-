export default async function handler(req, res) {
  // 1. 設定 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY; // 確保環境變數有這把鑰匙
  if (!apiKey) {
    return res.status(500).json({ error: "Missing API Key" });
  }

  const { keyword } = req.body;
  if (!keyword) {
    return res.status(400).json({ error: "Missing keyword" });
  }

  // ★ 關鍵：這裡定義了您想要的「發光果凍/玻璃風格」
  // 我們把使用者的關鍵字 (如: 拉麵) 嵌入到這段咒語中
  const stylePrompt = `
    A high-quality 3D icon of ${keyword}.
    Style: Glassmorphism, translucent frosted glass material, soft inner glowing light.
    Color Palette: Warm orange, peach, amber, and soft white.
    Lighting: Dreamy, soft studio lighting, internal glow, subsurface scattering.
    Composition: Minimalist, centered, isolated on a white background, high fidelity, 8k resolution, rounded edges, cute and abstract.
    No text, no realistic photo details, just a beautiful abstract 3D form.
  `;

  try {
    // 呼叫 Imagen 模型 (imagen-3.0-generate-001 或更新版)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: stylePrompt }],
          parameters: { sampleCount: 1, aspectRatio: "1:1" },
        }),
      }
    );

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const data = await response.json();
    
    // Imagen 回傳的是 Base64 編碼的圖片
    const base64Image = data.predictions?.[0]?.bytesBase64Encoded;
    
    if (!base64Image) {
        throw new Error("No image generated");
    }

    // 回傳 Data URL 給前端直接顯示
    res.status(200).json({ imageUrl: `data:image/png;base64,${base64Image}` });

  } catch (error) {
    console.error("Image Gen Error:", error);
    res.status(500).json({ error: "Failed to generate image", details: error.message });
  }
}
