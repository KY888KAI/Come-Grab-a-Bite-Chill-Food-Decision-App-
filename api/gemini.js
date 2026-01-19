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

  // ★ 接收前端傳來的 language 參數
  const { mode, prompt, candidates, userTags, language = "zh-TW" } = req.body;

  // ★ 語言鐵律 (Language Strict Rule)
  // 這段是為了防止 AI 講出簡體中文或中國用語
  const langInstruction = language.toLowerCase().includes("zh") 
    ? "【語言鐵律 (Language Rule)】：你必須使用「繁體中文 (Traditional Chinese, Taiwan)」回答。絕對禁止出現簡體中文或中國大陸用語（如：質量、視頻、土豆、性價比）。"
    : `【Language Rule】: Please respond in ${language}.`;

  let finalPrompt = "";

  if (mode === "filter") {
    // ★★★ 核心邏輯：AI 毒舌評審模式 ★★★
    
    const candidatesStr = candidates.map((p, i) => 
      `${i}. [${p.name}] (評分:${p.rating}, 價位:${p.priceLevel || '未知'})`
    ).join("\n");

    const tagsStr = userTags.join(", ");

    finalPrompt = `
      ${langInstruction}

      你是挑剔的美食評審。使用者想找符合這些條件的餐廳：【${tagsStr}】。
      
      請從以下候選名單中，挑選出「最符合」的 3 家店。
      
      【候選名單】：
      ${candidatesStr}

      【全方位邏輯審查規則 (零容忍)】：
      請針對使用者的標籤組合進行「三維度」交叉審查。只要違反任何一項，直接淘汰該店家。

      1. [預算維度 Budget]
         - 若標籤有「隨便吃吃」：絕對禁止推薦中高價位餐廳（如燒肉、火鍋、牛排、餐酒館、Omakase）。只准留平價小吃、便當、麵店、路邊攤、速食。
         - 若標籤有「犒賞自己」：請過濾掉過於普通的廉價快餐或環境簡陋的小吃（除非評分極高）。優先選氣氛好、特色強的餐廳。

      2. [份量維度 Hunger]
         - 若標籤有「吃飽」：必須是正餐類（飯、麵、排餐、火鍋）。絕對禁止推薦「純甜點、飲料、冰品、輕食沙拉」等吃不飽的類別。
         - 若標籤有「解饞」：優先推薦小吃、點心、甜點、炸物、滷味、飲料。禁止推薦「吃到飽、大份量合菜、高單價排餐」這種負擔太大的食物。

      3. [口味維度 Style] (嚴格招牌審查)
         - 若標籤有「清淡點」：
           - 定義：低油、低鹽、原味、清爽。
           - 絕對黑名單（看到即淘汰）：店名或類別含「麻辣、爆炒、重慶、川菜、燒烤、炭烤、烈火、炸雞、肥腸、濃郁豚骨」。
           - 優先錄取：健康餐、清蒸、水煮、粥品、潤餅、涼麵、壽司、蒸餃、生魚片、越南料理。
         - 若標籤有「重口味」：
           - 定義：鹹、辣、酸、甜、炸、醬汁濃厚。
           - 優先錄取：麻辣鍋、咖哩、熱炒、燒肉、鹽酥雞、漢堡、韓式炸雞、泰式料理。

      【最終一致性檢查】：
      - 請模擬人類直覺：如果店名跟使用者的任何一個需求有視覺或認知上的衝突（例如選「清淡」卻出現「猛火快炒」），直接淘汰，不要冒險。
      - 如果所有店家都被淘汰，請至少硬挑出 1-2 家「最不違和」的，不要回傳空名單。

      請回傳 JSON 格式，包含一個 ids 陣列，裡面是選中的 3 家店的編號 (index)。
      格式範例：{ "ids": [0, 5, 12] }
      不要解釋，只要 JSON。
    `;
  } else {
    // 原本的 AI 大廚推薦模式
    // 這裡也要加上 langInstruction，因為這裡 AI 會生成文字，最容易出現簡體字
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
