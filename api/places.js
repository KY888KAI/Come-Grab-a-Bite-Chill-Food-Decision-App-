// 這是 Vercel Serverless Function
// 它運行在後端，所以可以安全地使用 process.env.GOOGLE_MAPS_API_KEY

export default async function handler(req, res) {
  // 1. 設定 CORS
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. 取得前端傳來的參數 (新增 language)
  const { lat, lng, query, language } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ error: "Missing location data" });
  }

  // 3. 從 Vercel 環境變數拿鑰匙
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Server Configuration Error: Missing API Key" });
  }

  // 4. 呼叫 Google Places API (New)
  const googleApiUrl = "https://places.googleapis.com/v1/places:searchText";

  try {
    const googleRes = await fetch(googleApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // 只抓取需要的欄位
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.priceLevel,places.businessStatus"
      },
      body: JSON.stringify({
        textQuery: query || "餐廳",
        // ★ 關鍵修改：使用前端傳來的語系，如果沒有則預設繁體中文
        languageCode: language || "zh-TW", 
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 1000.0 // 1公里
          }
        },
        openNow: true,
        maxResultCount: 20
      })
    });

    if (!googleRes.ok) {
      // 捕捉 Google 回傳的詳細錯誤文字
      const errorText = await googleRes.text();
      console.error(`Google API Error (${googleRes.status}):`, errorText);
      throw new Error(`Google 拒絕連線 (${googleRes.status}): ${errorText}`);
    }

    const data = await googleRes.json();

    // 5. 整理資料
    const cleanPlaces = (data.places || []).map(p => ({
      id: p.id,
      name: p.displayName?.text,
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      rating: p.rating,
      userRatingsTotal: p.userRatingCount,
      price: (p.priceLevel === 'PRICE_LEVEL_INEXPENSIVE' || !p.priceLevel) ? 'budget' : 'mid',
      googlePlaceId: p.id,
      openNow: p.businessStatus === 'OPERATIONAL'
    }));

    res.status(200).json(cleanPlaces);

  } catch (error) {
    console.error("Backend Error:", error);
    // 將詳細錯誤回傳給前端，方便除錯
    res.status(500).json({ 
      error: "Google API 呼叫失敗", 
      details: error.message 
    });
  }
}
