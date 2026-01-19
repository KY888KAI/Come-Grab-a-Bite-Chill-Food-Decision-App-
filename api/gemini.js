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

      【全方位邏輯審查規則】：
      請針對使用者的標籤組合進行「三維度」交叉審查。

      1. [預算維度 Budget] (此維度需嚴格執行)
         - 若標籤有「隨便吃吃」：【絕對禁止】推薦中高價位餐廳（如燒肉、火鍋、牛排、餐酒館、Omakase）。目標是平價、日常飲食、高CP值的選擇。
         - 若標籤有「犒賞自己」：請過濾掉過於普通的廉價快餐。優先尋找有氣氛、特色強、或是該類別中評價極高的名店。

      2. [份量維度 Hunger] (依據用餐性質判斷)
         - 若標籤有「吃飽」：必須是正餐類。AI 請判斷該店是否提供「能當作一餐」的主食。
         - 若標籤有「解饞」：優先推薦非正餐時段也能輕鬆享用的食物，如小吃、點心、甜點、飲料。避免推薦負擔過重的「吃到飽」或「大份量合菜」。

      3. [口味維度 Style] (特徵導向審查)
         - 若標籤有「清淡點」：
           - 【特徵定義】：尋找低油、低鹽、烹調方式簡單（蒸、煮、涼拌）、強調食材原味、吃完身體無負擔的食物。
           - 【絕對黑名單 (Dead Logic)】：店名或類別若包含「麻辣、爆炒、重慶、川菜、炭烤、烈火、油炸、肥腸、濃厚」，直接淘汰，避免使用者產生認知衝突。
           - 【AI 判斷】：請發揮你的理解力，只要該店家的招牌菜色或整體風格符合「清爽無負擔」的特徵即可入選，不侷限於特定菜色。
         
         - 若標籤有「重口味」：
           - 【特徵定義】：尋找味覺衝擊強烈、醬汁濃厚、辛香料豐富、高熱量、或者能帶來強烈滿足感的食物。
           - 【AI 判斷】：請發揮你的理解力，優先挑選能刺激味蕾的店家（如鹹、辣、酸、炸、烤），不侷限於特定菜色。

      【最終一致性檢查】：
      - 請模擬人類直覺：如果店名跟使用者的任何一個需求有「視覺上或認知上」的明顯衝突（例如選「清淡」卻出現「猛火快炒」），直接淘汰。
      - 如果所有店家都被淘汰（符合條件者為 0），請直接回傳空的 ids 陣列 \`[]\`。絕對不要為了湊數而硬挑不符合的店家。這非常重要！因為我們會根據空名單來自動擴大搜尋範圍。

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
