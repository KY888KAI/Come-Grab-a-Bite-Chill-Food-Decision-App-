// 這是 Vercel Serverless Function
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
            radius: radius 
          }
        },
        openNow: true, // ★ 關鍵：只抓取目前營業中的店
        maxResultCount: 20 
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

    // 1. 距離過濾 (物理鐵律：超過半徑 10% 還是要砍，不然會出現 25km 的店)
    const maxDistKm = (radius * 1.1) / 1000;
    cleanPlaces = cleanPlaces.filter(p => {
      if (!p.lat || !p.lng) return false;
      const dist = getDistanceFromLatLonInKm(lat, lng, p.lat, p.lng);
      return dist <= maxDistKm;
    });

    // ★ 修改：移除之前的「評分過濾」
    // 我們不應該在這裡把 3.8 分以下的店殺掉。
    // 因為如果地點很偏僻，這可能是唯一的選擇。
    // 把裁量權完全交給後端 AI (gemini.js) 去判斷是否要「破例錄取」。

    // 2. 排序 (距離優先)
    // 確保前端在做保底顯示時，拿到的一定是距離最近的
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


