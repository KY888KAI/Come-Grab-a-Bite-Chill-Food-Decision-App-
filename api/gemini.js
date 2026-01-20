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
    ? "【語言鐵律】：你必須使用「繁體中文 (Traditional Chinese, Taiwan)」回答。絕對禁止出現簡體中文或中國大陸用語。"
    : `【Language Rule】: Please respond in ${language}.`;

  let finalPrompt = "";

  if (mode === "filter") {
    
    // 將店家資料整理成 AI 好讀的格式
    const candidatesStr = candidates.map((p, i) => {
      const typesStr = p.types ? p.types.join(", ") : "未知類別";
      return `${i}. [${p.name}] (評分:${p.rating}, 評論數:${p.userRatingsTotal}, 價位:${p.priceLevel || '無資料'}, 類別:${typesStr})`;
    }).join("\n");

    const tagsStr = userTags.join(", "); 

    // 解析邏輯標籤
    const isCheap = logicTags.includes("CHEAP");
    const isExpensive = logicTags.includes("EXPENSIVE");
    const isFull = logicTags.includes("FULL");
    const isSnack = logicTags.includes("SNACK");
    const isLight = logicTags.includes("LIGHT");
    const isRich = logicTags.includes("RICH");

    finalPrompt = `
      ${langInstruction}

      你是一個極度挑剔、品味嚴格的美食評論家。你的任務是從候選名單中挑選出「最符合使用者需求」的 3 家店。
      
      【使用者需求標籤】：${tagsStr}
      
      【全方位審查鐵律 (Iron Rules)】 - 你必須嚴格遵守，寧缺勿濫：

      1. [預算維度 Budget]
         ${isExpensive ? `- 使用者選了「犒賞自己 (Expensive)」：
           - **絕對死刑 (Banned)**：任何形式的「小吃攤」、「路邊攤」、「便當店」、「麵線/肉羹/粥」、「連鎖速食(麥當勞等)」、「平價連鎖鍋貼」。即使它有 5.0 顆星，也必須淘汰！
           - **合格標準**：必須是異國料理、餐酒館、居酒屋、精緻早午餐、牛排館等有「用餐體驗」的店。
           - 若沒有明確價格標示，請根據店名和類別判斷氣氛。` : ''}
         ${isCheap ? `- 使用者選了「隨便吃吃 (Cheap)」：
           - **優先錄取**：高 CP 值的便當、麵攤、小吃、速食。
           - **淘汰**：看起來需要服務費、或是名字聽起來很高級的法式/義式餐廳。` : ''}

      2. [份量維度 Hunger]
         ${isFull ? `- 使用者選了「吃飽 (Full)」：
           - **絕對死刑**：咖啡廳 (除非有賣飯麵)、甜點店、麵包店、酒吧、純飲料店。
           - **合格標準**：必須提供完整的一餐 (Main Course)。` : ''}
         ${isSnack ? `- 使用者選了「解饞 (Snack)」：
           - **優先錄取**：炸物、甜點、滷味、街頭小吃、麵包。
           - **淘汰**：大份量的火鍋吃到飽、合菜餐廳、高價牛排館。` : ''}

      3. [口味維度 Taste]
         ${isLight ? `- 使用者選了「清淡 (Light)」：
           - **絕對死刑**：麻辣鍋、鹹酥雞、燒烤、重油重鹹的熱炒、濃厚系拉麵、美式炸物。
           - **優先錄取**：健康餐 (Poke)、壽司、清蒸料理、早午餐、沙拉、越南河粉。` : ''}
         ${isRich ? `- 使用者選了「重口味 (Rich)」：
           - **優先錄取**：咖哩、麻辣、泰式、韓式、炸物、燒烤、快炒。
           - **淘汰**：健康水煮餐、清淡的粥、傳統三明治。` : ''}

      【候選名單】：
      ${candidatesStr}

      【最終輸出】：
      - 請回傳一個 JSON 物件，包含一個 "ids" 陣列，裡面是選中的 3 家店的編號 (index)。
      - 如果所有店家都違反上述鐵律（例如選「犒賞自己」但全是路邊攤），請回傳空陣列 \`[]\`。我們寧可不推薦，也不要亂推薦。
      
      格式範例：{ "ids": [0, 5, 12] }
      不要解釋，只要 JSON。
    `;
  } else {
    // 針對 "AI 建議" 模式 (suggestion)
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
