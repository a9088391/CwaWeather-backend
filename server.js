require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 支援的縣市清單
const VALID_LOCATIONS = [
  "宜蘭縣",
  "花蓮縣",
  "臺東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
  "臺北市",
  "新北市",
  "桃園市",
  "臺中市",
  "臺南市",
  "高雄市",
  "基隆市",
  "新竹縣",
  "新竹市",
  "苗栗縣",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義縣",
  "嘉義市",
  "屏東縣",
];

// 預設城市
const DEFAULT_LOCATION = "臺中市";

// 縣市對應的一週天氣預報資料集代碼 (F-D0047 系列)
// 使用尾碼 003, 007, 011... 為未來 1 週逐 12 小時預報資料
const LOCATION_API_MAP = {
  宜蘭縣: "F-D0047-003",
  桃園市: "F-D0047-007",
  新竹縣: "F-D0047-011",
  苗栗縣: "F-D0047-015",
  彰化縣: "F-D0047-019",
  南投縣: "F-D0047-023",
  雲林縣: "F-D0047-027",
  嘉義縣: "F-D0047-031",
  屏東縣: "F-D0047-035",
  臺東縣: "F-D0047-039",
  花蓮縣: "F-D0047-043",
  澎湖縣: "F-D0047-047",
  基隆市: "F-D0047-051",
  新竹市: "F-D0047-055",
  嘉義市: "F-D0047-059",
  臺北市: "F-D0047-063",
  高雄市: "F-D0047-067",
  新北市: "F-D0047-071",
  臺中市: "F-D0047-075",
  臺南市: "F-D0047-079",
  連江縣: "F-D0047-083",
  金門縣: "F-D0047-087",
};

/**
 * 取得指定縣市天氣預報
 * CWA 氣象資料開放平臺 API
 * 使用「一週天氣預報」資料集 (F-D0047 系列)
 * @param {string} locationName - 縣市名稱（query parameter）
 */
const getWeather = async (req, res) => {
  try {
    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 取得並驗證 locationName 參數
    let locationName = req.query.locationName || req.params.locationName;

    // 如果沒有提供或不在有效清單中，使用預設城市
    if (!locationName || !VALID_LOCATIONS.includes(locationName)) {
      locationName = DEFAULT_LOCATION;
    }

    // 取得該縣市對應的資料集代碼
    const datasetId = LOCATION_API_MAP[locationName];

    // 呼叫 CWA API - 一週天氣預報
    // API 文件: https://opendata.cwa.gov.tw/dist/opendata-swagger.html
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/${datasetId}`,
      {
        params: {
          Authorization: CWA_API_KEY,
        },
      }
    );

    // 取得指定縣市的天氣資料
    // 注意：API 欄位名稱是 Pascal Case (首字母大寫)
    const locationsData = response.data.records.Locations?.[0];
    const locationData = locationsData?.Location?.[0];

    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: `無法取得${locationName}天氣資料`,
      });
    }

    // 整理天氣資料
    const weatherData = {
      city: locationName,
      district: locationData.LocationName,
      updateTime: locationsData?.DatasetDescription || "",
      forecasts: [],
    };

    // 建立天氣要素的對應表（元素名稱是中文）
    const weatherElements = {};
    locationData.WeatherElement.forEach((element) => {
      weatherElements[element.ElementName] = element.Time;
    });

    // 使用「天氣現象」的時間序列作為基準
    const wxTimes = weatherElements["天氣現象"] || [];

    for (let i = 0; i < wxTimes.length; i++) {
      const timeData = wxTimes[i];
      const forecast = {
        startTime: timeData.StartTime,
        endTime: timeData.EndTime,
        weather: "",
        weatherCode: "",
        rain: "",
        temperature: "",
        apparentTemp: "",
        comfort: "",
        windDirection: "",
        windSpeed: "",
        humidity: "",
        description: "",
      };

      // 解析天氣現象
      const wxValue = timeData.ElementValue?.[0];
      if (wxValue) {
        forecast.weather = wxValue.Weather || "";
        forecast.weatherCode = wxValue.WeatherCode || "";
      }

      // 解析溫度
      if (weatherElements["溫度"]?.[i]) {
        const temp = weatherElements["溫度"][i].ElementValue?.[0]?.Temperature;
        forecast.temperature = temp ? temp + "°C" : "";
      }

      // 解析體感溫度
      if (weatherElements["體感溫度"]?.[i]) {
        const at = weatherElements["體感溫度"][i].ElementValue?.[0]?.ApparentTemperature;
        forecast.apparentTemp = at ? at + "°C" : "";
      }

      // 解析舒適度指數
      if (weatherElements["舒適度指數"]?.[i]) {
        const ci = weatherElements["舒適度指數"][i].ElementValue?.[0]?.ComfortIndex;
        forecast.comfort = ci || "";
      }

      // 解析3小時降雨機率
      if (weatherElements["3小時降雨機率"]?.[i]) {
        const pop = weatherElements["3小時降雨機率"][i].ElementValue?.[0]?.ProbabilityOfPrecipitation;
        forecast.rain = pop ? pop + "%" : "";
      }

      // 解析風向
      if (weatherElements["風向"]?.[i]) {
        forecast.windDirection = weatherElements["風向"][i].ElementValue?.[0]?.WindDirection || "";
      }

      // 解析風速
      if (weatherElements["風速"]?.[i]) {
        const ws = weatherElements["風速"][i].ElementValue?.[0]?.WindSpeed;
        forecast.windSpeed = ws ? ws + " m/s" : "";
      }

      // 解析相對濕度
      if (weatherElements["相對濕度"]?.[i]) {
        const rh = weatherElements["相對濕度"][i].ElementValue?.[0]?.RelativeHumidity;
        forecast.humidity = rh ? rh + "%" : "";
      }

      // 解析天氣預報綜合描述
      if (weatherElements["天氣預報綜合描述"]?.[i]) {
        forecast.description = weatherElements["天氣預報綜合描述"][i].ElementValue?.[0]?.WeatherDescription || "";
      }

      weatherData.forecasts.push(forecast);
    }

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);
    console.error("錯誤詳情:", error);

    if (error.response) {
      // API 回應錯誤
      console.error("API 回應狀態:", error.response.status);
      console.error("API 回應資料:", JSON.stringify(error.response.data, null, 2));
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    // 其他錯誤
    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
      debug: error.message,
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API",
    endpoints: {
      weather: "/api/weather?locationName=縣市名稱",
      weatherByPath: "/api/weather/:locationName",
      locations: "/api/locations",
      health: "/api/health",
    },
    defaultLocation: DEFAULT_LOCATION,
    validLocations: VALID_LOCATIONS,
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 取得支援的縣市清單
app.get("/api/locations", (req, res) => {
  res.json({
    success: true,
    data: {
      locations: VALID_LOCATIONS,
      default: DEFAULT_LOCATION,
    },
  });
});

// 取得指定縣市天氣預報（透過 query parameter）
app.get("/api/weather", getWeather);

// 取得指定縣市天氣預報（透過 path parameter）
app.get("/api/weather/:locationName", getWeather);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});
