// 這是 Vercel Serverless Function
// 增加距離計算函式，嚴格把關
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球半徑 (km)
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

export default async function handler(req, res) {
  // 1. 設定 CORS
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. 取得參數 (接收前端傳來的 radius)
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
        // 抓取必要的欄位，包含 priceLevel 與 types 供 AI 判斷
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.priceLevel,places.businessStatus,places.types"
      },
      body: JSON.stringify({
        textQuery: query || "美食",
        languageCode: language || "zh-TW", 
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radius // ★ 關鍵：使用動態半徑，不寫死
          }
        },
        openNow: true,
        maxResultCount: 20 // ★ 關鍵：抓夠多資料給 AI 挑
      })
    });

    if (!googleRes.ok) {
      throw new Error(`Google API Error: ${googleRes.status}`);
    }

    const data = await googleRes.json();

    let cleanPlaces = (data.places || []).map(p => ({
      id: p.id,
      name: p.displayName?.text,
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      rating: p.rating,
      userRatingsTotal: p.userRatingCount,
      priceLevel: p.priceLevel, 
      price: (p.priceLevel === 'PRICE_LEVEL_INEXPENSIVE' || !p.priceLevel) ? 'budget' : 'mid', 
      googlePlaceId: p.id,
      types: p.types,
      openNow: p.businessStatus === 'OPERATIONAL'
    }));

    // ★★★ 距離鐵律 (Distance Hard Limit) ★★★
    // 這是為了防止「出現 25km 外店家」的絕對防禦
    // 允許 10% 的誤差緩衝 (e.g. 1000m -> 允許到 1100m)，超過就砍。
    const maxDistKm = (radius * 1.1) / 1000;
    
    cleanPlaces = cleanPlaces.filter(p => {
      if (!p.lat || !p.lng) return false;
      const dist = getDistanceFromLatLonInKm(lat, lng, p.lat, p.lng);
      return dist <= maxDistKm;
    });

    // ★ 強制排序：由近到遠
    // 確保前端在做保底顯示時，拿到的一定是最近的
    cleanPlaces.sort((a, b) => {
        const distA = getDistanceFromLatLonInKm(lat, lng, a.lat, a.lng);
        const distB = getDistanceFromLatLonInKm(lat, lng, b.lat, b.lng);
        return distA - distB;
    });

    res.status(200).json(cleanPlaces);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: "Google API 呼叫失敗", details: error.message });
  }
}
