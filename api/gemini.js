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

  // ★ 新增接收 logicTags (邏輯代碼)
  const { mode, prompt, candidates, userTags, logicTags = [], language = "zh-TW" } = req.body;

  const langInstruction = language.toLowerCase().includes("zh") 
    ? "【語言鐵律 (Language Rule)】：你必須使用「繁體中文 (Traditional Chinese, Taiwan)」回答。絕對禁止出現簡體中文或中國大陸用語。"
    : `【Language Rule】: Please respond in ${language}.`;

  let finalPrompt = "";

  if (mode === "filter") {
    
    const candidatesStr = candidates.map((p, i) => {
      const typesStr = p.types ? p.types.join(", ") : "未知類別";
      return `${i}. [${p.name}] (評分:${p.rating}, 價位:${p.priceLevel || '未知'}, 類別:${typesStr})`;
    }).join("\n");

    const tagsStr = userTags.join(", "); 
    const isCheap = logicTags.includes("CHEAP");
    const isExpensive = logicTags.includes("EXPENSIVE");
    const isFull = logicTags.includes("FULL");
    const isSnack = logicTags.includes("SNACK");
    const isLight = logicTags.includes("LIGHT");
    const isRich = logicTags.includes("RICH");

    finalPrompt = `
      ${langInstruction}

      你是挑剔的美食評審。使用者想找符合這些條件的餐廳：【${tagsStr}】。
      
      請從以下候選名單中，挑選出「最符合」的 3 家店。
      
      【候選名單】：
      ${candidatesStr}

      【全方位邏輯審查規則 (Logic Code Check)】：

      1. [預算維度 Budget]
         ${isCheap ? `- 標籤含 CHEAP (隨便吃吃)：【絕對禁止】推薦中高價位餐廳。若 priceLevel 是 PRICE_LEVEL_EXPENSIVE 或類別含 fine_dining，直接淘汰。` : ''}
         ${isExpensive ? `- 標籤含 EXPENSIVE (犒賞自己)：請過濾掉過於普通的廉價快餐。優先選氣氛好、特色強的餐廳。` : ''}

      2. [份量維度 Hunger]
         ${isFull ? `- 標籤含 FULL (吃飽)：必須是正餐類。禁止推薦 cafe, bakery, dessert_shop, bar。` : ''}
         ${isSnack ? `- 標籤含 SNACK (解饞)：優先推薦小吃、點心。` : ''}

      3. [口味維度 Style]
         ${isLight ? `- 標籤含 LIGHT (清淡點)：
           - 【嚴格類別檢查】：若類別包含 "fried_chicken", "fast_food", "barbecue", "pizza", "hamburger"，**直接淘汰**！
           - 【關鍵字黑名單】：店名若含「炸雞、酥脆、爆汁、麻辣、燒肉」，淘汰。
           - 優先錄取：health_food, vegetarian, japanese_restaurant (壽司/生魚片), porridge, noodle (清湯)。` : ''}
         
         ${isRich ? `- 標籤含 RICH (重口味)：
           - 優先錄取：spicy, curry, barbecue, fried, fast_food, thai, mexican。` : ''}

      【最終一致性檢查】：
      - 如果所有店家都被淘汰，請直接回傳空的 ids 陣列 \`[]\`。絕對不要為了湊數而硬挑不符合的店家。

      請回傳 JSON 格式，包含一個 ids 陣列，裡面是選中的 3 家店的編號 (index)。
      格式範例：{ "ids": [0, 5, 12] }
      不要解釋，只要 JSON。
    `;
  } else {
    finalPrompt = `
      ${langInstruction}
      ${prompt}
    `;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        contents: [{ parts: [{ text: finalPrompt }] }],
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
