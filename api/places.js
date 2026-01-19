// 這是 Vercel Serverless Function
export default async function handler(req, res) {
  // 1. 設定 CORS
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. 取得參數 (新增 radius)
  // 預設半徑 1000m (1km)，但允許前端傳入更大的值來進行「同心圓搜尋」
  const { lat, lng, query, language, radius = 1000 } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ error: "Missing location data" });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Server Configuration Error: Missing API Key" });
  }

  const googleApiUrl = "https://places.googleapis.com/v1/places:searchText";

  try {
    const googleRes = await fetch(googleApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // 只抓取需要的欄位，特別是 priceLevel (價位) 和 types (類別) 供 AI 判斷
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.priceLevel,places.businessStatus,places.types"
      },
      body: JSON.stringify({
        textQuery: query || "美食",
        languageCode: language || "zh-TW", 
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radius // ★ 關鍵修改：使用動態半徑
          }
        },
        openNow: true,
        maxResultCount: 20 // ★ 關鍵修改：抓 20 家回來給 AI 挑，而不是只抓一點點
      })
    });

    if (!googleRes.ok) {
      throw new Error(`Google API Error: ${googleRes.status}`);
    }

    const data = await googleRes.json();

    // 整理資料
    const cleanPlaces = (data.places || []).map(p => ({
      id: p.id,
      name: p.displayName?.text,
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      rating: p.rating,
      userRatingsTotal: p.userRatingCount,
      // 轉換價格格式供前端與 AI 使用
      priceLevel: p.priceLevel, 
      price: (p.priceLevel === 'PRICE_LEVEL_INEXPENSIVE' || !p.priceLevel) ? 'budget' : 'mid', 
      googlePlaceId: p.id,
      types: p.types, // 保留類別給 AI 參考
      openNow: p.businessStatus === 'OPERATIONAL'
    }));

    res.status(200).json(cleanPlaces);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: "Google API 呼叫失敗", details: error.message });
  }
}
