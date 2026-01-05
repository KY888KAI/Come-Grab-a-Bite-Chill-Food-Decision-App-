export default function handler(req, res) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  
  // 為了安全，我們只顯示前幾個字，不要顯示整串
  const safeKeyView = key ? `${key.substring(0, 5)}...` : "完全讀不到 (Undefined)";

  res.status(200).json({
    message: "Debug Info",
    keyStatus: safeKeyView,
    envCheck: process.env.VERCEL ? "Running on Vercel" : "Not Vercel"
  });
}
