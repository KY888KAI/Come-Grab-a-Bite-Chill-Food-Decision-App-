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

      【全方位邏輯審查規則 (0 失誤標準)】：

      1. [營業時間鐵律]：
         - 雖然名單應該都是營業中的，但請你再次把關。
         - 如果店名明顯顯示現在不該營業（例如現在是半夜，但店名是「美而美早餐」），請淘汰。

      2. [評分標準]：
         - 原則上只錄取 **評分 4.0 以上** 的店家。
         - 例外：如果該店極度符合使用者需求（例如半夜唯一開著的清粥小菜），且評分不低於 3.5，可以破例錄取。

      3. [預算維度 Budget]
         ${isCheap ? `- 標籤含 CHEAP (隨便吃吃)：
           - 接受 Price Level 1 (Cheap)。
           - 接受 Price Level 2 (Moderate) **前提是** 它是小吃、麵店、便當類 (非餐廳)。
           - 絕對淘汰 Price Level 3, 4 或 Fine Dining。` : ''}
         ${isExpensive ? `- 標籤含 EXPENSIVE (犒賞自己)：
           - 接受 Price Level 3, 4。
           - 接受 Price Level 2 **前提是** 評分高於 4.4 且氣氛佳的餐廳 (火鍋、居酒屋)。
           - 絕對淘汰小吃攤、便當店、速食店。` : ''}

      4. [份量維度 Hunger]
         ${isFull ? `- 標籤含 FULL (吃飽)：必須是正餐類。禁止推薦 cafe, bakery, dessert_shop, bar。` : ''}
         ${isSnack ? `- 標籤含 SNACK (解饞)：優先推薦小吃、點心。允許便利商店/超市，但優先級最低。` : ''}

      5. [口味維度 Style]
         ${isLight ? `- 標籤含 LIGHT (清淡點)：
           - 黑名單：麻辣、爆炒、重慶、川菜、炭烤、烈火、油炸、肥腸、濃厚。
           - 優先錄取：健康餐、清蒸、水煮、粥品、潤餅、涼麵、壽司、蒸餃。` : ''}
         
         ${isRich ? `- 標籤含 RICH (重口味)：
           - 優先錄取：spicy, curry, barbecue, fried, fast_food, thai, mexican。` : ''}

      6. [超商/量販店處理]：
         - 除非使用者選「解饞」且附近真的沒餐廳，否則盡量不要推薦 convenience_store 或 supermarket。它們是最後的備案。

      【最終輸出】：
      - 如果所有店家都被淘汰，請直接回傳空的 ids 陣列 \`[]\`。**這非常重要！不要硬湊數！**
      - 我們會根據空名單自動觸發「退而求其次」的保底機制。

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


