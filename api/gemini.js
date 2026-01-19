export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing Gemini API Key" });
  }

  // 取得模式：是「大廚推薦(suggestion)」還是「店家過濾(filter)」？
  const { mode, prompt, candidates, userTags } = req.body;

  let finalPrompt = "";

  if (mode === "filter") {
    // ★★★ 核心邏輯：AI 毒舌評審模式 ★★★
    // 這是我們剛剛討論的重點：嚴格過濾、招牌檢查、邏輯對應
    
    const candidatesStr = candidates.map((p, i) => 
      `${i}. [${p.name}] (評分:${p.rating}, 價位:${p.priceLevel || '未知'})`
    ).join("\n");

    const tagsStr = userTags.join(", ");

    finalPrompt = `
      你是挑剔的美食評審。使用者想找符合這些條件的餐廳：【${tagsStr}】。
      
      請從以下候選名單中，挑選出「最符合」的 3 家店。
      
      【候選名單】：
      ${candidatesStr}

      【嚴格淘汰規則】：
      1. [預算鐵律] 如果使用者標籤有「隨便吃吃」，絕對刪除所有高價位餐廳（如燒肉、高級火鍋、高價牛排）。只留小吃、便當、麵店。
      2. [招牌一致性] 如果使用者標籤有「來點清淡」，店名若包含「麻辣、爆炒、重慶、燒烤、烈火」等刺激字眼，直接淘汰！即便它有賣清淡食物也不行，避免使用者困惑。
      3. [口味對應] 如果使用者選「重口味」，優先挑選炸物、燒烤、麻辣。
      
      請回傳 JSON 格式，包含一個 ids 陣列，裡面是選中的 3 家店的編號 (index)。
      格式範例：{ "ids": [0, 5, 12] }
      不要解釋，只要 JSON。
    `;
  } else {
    // 原本的 AI 大廚推薦模式
    finalPrompt = prompt;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        contents: [{ parts: [{ text: finalPrompt }] }],
        // 強制 AI 回傳 JSON 格式，減少解析錯誤
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    console.error("Gemini Backend Error:", error);
    res.status(500).json({ error: "Failed to fetch from Gemini" });
  }
}
