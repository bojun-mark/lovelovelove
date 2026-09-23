# 出生地資料

117 個城市／地點：台灣 25、香港 13、澳門 2、中國大陸 51、新加坡 1、馬來西亞 25。
不是所有城鎮的完整名錄。選單未列出的出生地不會自動匹配附近城市。

## 來源與授權

座標、地名別名與時區來自 GeoNames cities500 資料集：
- https://download.geonames.org/export/dump/cities500.zip
- https://www.geonames.org/export/
- 授權：Creative Commons Attribution 4.0，https://creativecommons.org/licenses/by/4.0/

本專案篩選地點、整理繁體中文顯示名稱，並保留 GeoNames ID 供查核。
座標代表城市中心附近位置，不是使用者的醫院或街道地址。
資料依原授權按現狀提供，不保證完整或精確。

## 時間處理

由 Node/瀏覽器的 Intl 與 IANA 時區資料換算歷史日期，包含夏令時間與歷史半小時偏移。
參考 https://data.iana.org/time-zones/tzdb/asia 。部署環境需有完整 ICU 時區支援（Render Node 提供）。
中國大陸選項統一以北京時間（Asia/Shanghai）解讀；烏魯木齊的原始 Asia/Urumqi 已明確改用 Asia/Shanghai。
出生紀錄若採用新疆地方時間，需先確認換算，介面會提示。
不存在的時間與重複時間會明確拒絕，不靜默決定；出生時間不詳時使用當地中午近似，不計算上升與宮位。

本更新只修正出生地與時間換算；原有近似行星計算沒有因此變成精密星曆。

## 台灣行政區更新（2026-09-24）
台灣選單取代原本 25 個城市代表點，改為 22 縣市、368 鄉鎮市區。全選單現有 460 個選項；其他地區資料不變。
行政區代表座標來源：https://gist.github.com/memochou1993/aa9b6b1185221f88a03109f10d32e5e2 （2023-08-30 版本，2026-09-24 下載）。
名稱與完整性另對照：https://github.com/donma/TaiwanAddressCityAreaRoadChineseEnglishJSON/blob/master/CityCountyData.json ，368 個名稱完全一致。
排除來源中的釣魚臺列嶼、東沙群島、南沙群島郵遞項目，僅納入鄉鎮市區。使用現行名稱；臺統一顯示為台。
座標為區域代表位置，並非醫院、住址或出生位置測量值；行政區很大或跨島時仍有近似誤差。時區採 Asia/Taipei，由既有歷史時區換算處理。
舊的出生地文字仍讀取原始座標；新增填寫必須選縣市及鄉鎮市區，不會將舊的縣市紀錄擅自改成某一區。
