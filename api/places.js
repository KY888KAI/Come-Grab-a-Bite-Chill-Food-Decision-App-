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
        // ★ 確保抓取 businessStatus 和 currentOpeningHours (雖然 API 參數 openNow=true 已經過濾，但多拿資料給 AI 判斷更好)
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

    // 1. 距離過濾
    const maxDistKm = (radius * 1.1) / 1000;
    cleanPlaces = cleanPlaces.filter(p => {
      if (!p.lat || !p.lng) return false;
      const dist = getDistanceFromLatLonInKm(lat, lng, p.lat, p.lng);
      return dist <= maxDistKm;
    });

    // 2. 評分過濾 (後端第一道防線)
    // 如果結果夠多 (>5)，先砍掉 3.8 以下的雷店，減輕 AI 負擔
    if (cleanPlaces.length > 5) {
        cleanPlaces = cleanPlaces.filter(p => (p.rating || 0) >= 3.8);
    }

    // 3. 排序 (距離優先)
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


