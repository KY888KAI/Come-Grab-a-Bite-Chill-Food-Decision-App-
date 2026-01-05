// 這是 Vercel Serverless Function
// 它運行在後端，所以可以安全地使用 process.env.GOOGLE_MAPS_API_KEY

export default async function handler(req, res) {
  // 1. 為了安全性，限制只有你的 GitHub Pages 網址可以呼叫 (上線前建議設定)
  // res.setHeader('Access-Control-Allow-Origin', 'https://your-username.github.io');
  res.setHeader('Access-Control-Allow-Origin', '*'); // 目前先允許所有來源方便測試
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. 取得前端傳來的參數
  const { lat, lng, query } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ error: "Missing location data" });
  }

  // 3. 從 Vercel 環境變數拿鑰匙 (記得在 Vercel 後台設定 GOOGLE_MAPS_API_KEY)
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Server Configuration Error: Missing API Key" });
  }

  // 4. 呼叫 Google Places API (New) - Text Search
  const googleApiUrl = "https://places.googleapis.com/v1/places:searchText";

  try {
    const googleRes = await fetch(googleApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // 只抓取需要的欄位以節省成本
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.priceLevel,places.businessStatus"
      },
      body: JSON.stringify({
        textQuery: query || "餐廳",
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 1000.0 // 搜尋半徑 1公里
          }
        },
        openNow: true, // 只找營業中
        maxResultCount: 20
      })
    });

    if (!googleRes.ok) {
      const errorText = await googleRes.text();
      throw new Error(`Google API Error: ${googleRes.status} ${errorText}`);
    }

    const data = await googleRes.json();

    // 5. 整理資料回傳給前端
    const cleanPlaces = (data.places || []).map(p => ({
      id: p.id,
      name: p.displayName?.text,
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      rating: p.rating,
      userRatingsTotal: p.userRatingCount,
      // 將 Google 的價格等級轉換為我們的格式
      price: (p.priceLevel === 'PRICE_LEVEL_INEXPENSIVE' || !p.priceLevel) ? 'budget' : 'mid',
      googlePlaceId: p.id,
      openNow: p.businessStatus === 'OPERATIONAL'
    }));

    res.status(200).json(cleanPlaces);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: "Failed to fetch places from Google" });
  }
}
