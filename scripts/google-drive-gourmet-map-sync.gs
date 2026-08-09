/**
 * IRO+ グルメマップCSV自動連携（Google Apps Script）
 *
 * 1. script.google.com で新しいプロジェクトを作成し、この内容を貼り付けます。
 * 2. initialSetup() を1回実行して権限を承認します。
 * 3. ウェブアプリとして「アクセスできるユーザー: 全員」でデプロイします。
 *
 * 店舗情報は会員アプリに表示する公開情報のみを返します。
 */

var GOURMET_MAP_FOLDER_ID = "1_OM9NWjmOF2bzVkBbv_kJJ_RrjeWijyG";
var FEED_FILE_NAME = "_irotas_gourmet_map_feed.json";

function categoryFromFilename(filename) {
  return filename
    .replace(/\.csv$/i, "")
    .replace(/^\d{6,8}[_-]?/, "")
    .trim() || "未分類";
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

function numberValue(value) {
  var parsed = Number(value);
  return isFinite(parsed) ? parsed : 0;
}

function rowObject(headers, values) {
  var row = {};
  headers.forEach(function (header, index) {
    row[header] = values[index] == null ? "" : values[index];
  });
  return row;
}

function parseRestaurant(row, category, importedAt) {
  var placeId = text(row["Place Id"]);
  var name = text(row.Name);
  var address = text(row.Fulladdress);
  var googleMapsUrl = text(row["Google Maps URL"]);
  var latitude = numberValue(row.Latitude);
  var longitude = numberValue(row.Longitude);
  var rating = numberValue(row["Average Rating"]);

  if (!placeId) throw new Error("Place IDがありません");
  if (!name) throw new Error("店名がありません");
  if (!address) throw new Error("住所がありません");
  if (!/^https:\/\//.test(googleMapsUrl)) throw new Error("GoogleマップURLが不正です");
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error("座標が不正です");
  }

  return {
    id: "gm_" + placeId,
    placeId: placeId,
    name: name,
    genre: category,
    sourceCategories: text(row.Categories).split(",").map(function (value) { return value.trim(); }).filter(Boolean),
    address: address,
    latitude: latitude,
    longitude: longitude,
    rating: rating,
    reviewCount: numberValue(row["Review Count"]),
    image: text(row["Featured Image"]),
    googleMapsUrl: googleMapsUrl,
    phone: text(row.Phone) || undefined,
    price: text(row.Price) || undefined,
    sourceList: category,
    importedAt: importedAt
  };
}

function saveFeed(folder, payload) {
  var files = folder.getFilesByName(FEED_FILE_NAME);
  var json = JSON.stringify(payload);
  if (files.hasNext()) {
    files.next().setContent(json);
  } else {
    folder.createFile(FEED_FILE_NAME, json, MimeType.PLAIN_TEXT);
  }
}

function rebuildGourmetMapFeed() {
  var folder = DriveApp.getFolderById(GOURMET_MAP_FOLDER_ID);
  var iterator = folder.getFiles();
  var csvFiles = [];
  while (iterator.hasNext()) {
    var file = iterator.next();
    if (/\.csv$/i.test(file.getName())) csvFiles.push(file);
  }
  csvFiles.sort(function (a, b) { return a.getLastUpdated().getTime() - b.getLastUpdated().getTime(); });

  var restaurantMap = {};
  var fileSummaries = [];
  var errors = [];

  csvFiles.forEach(function (file) {
    var category = categoryFromFilename(file.getName());
    var importedAt = file.getLastUpdated().toISOString();
    var values = Utilities.parseCsv(file.getBlob().getDataAsString("UTF-8"));
    if (!values.length) return;
    var headers = values[0].map(function (header) { return text(header).replace(/^\uFEFF/, ""); });
    var rowCount = 0;

    values.slice(1).forEach(function (valuesRow, index) {
      if (!valuesRow.some(function (value) { return text(value); })) return;
      try {
        var restaurant = parseRestaurant(rowObject(headers, valuesRow), category, importedAt);
        restaurantMap[restaurant.placeId] = restaurant;
        rowCount += 1;
      } catch (error) {
        if (errors.length < 100) {
          errors.push({ file: file.getName(), row: index + 2, message: error.message });
        }
      }
    });

    fileSummaries.push({
      id: file.getId(),
      name: file.getName(),
      updatedAt: importedAt,
      category: category,
      rowCount: rowCount
    });
  });

  var payload = {
    updatedAt: new Date().toISOString(),
    sourceFolderId: GOURMET_MAP_FOLDER_ID,
    files: fileSummaries,
    restaurants: Object.keys(restaurantMap).map(function (key) { return restaurantMap[key]; }),
    errors: errors
  };
  saveFeed(folder, payload);
  PropertiesService.getScriptProperties().setProperty("LAST_SYNC_SUMMARY", JSON.stringify({
    updatedAt: payload.updatedAt,
    files: payload.files.length,
    restaurants: payload.restaurants.length,
    errors: payload.errors.length
  }));
  return payload;
}

function getSavedFeed() {
  var folder = DriveApp.getFolderById(GOURMET_MAP_FOLDER_ID);
  var files = folder.getFilesByName(FEED_FILE_NAME);
  if (!files.hasNext()) return rebuildGourmetMapFeed();
  return JSON.parse(files.next().getBlob().getDataAsString("UTF-8"));
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify(getSavedFeed()))
    .setMimeType(ContentService.MimeType.JSON);
}

function installHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "rebuildGourmetMapFeed") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("rebuildGourmetMapFeed").timeBased().everyHours(1).create();
}

function initialSetup() {
  var payload = rebuildGourmetMapFeed();
  installHourlyTrigger();
  return {
    files: payload.files.length,
    restaurants: payload.restaurants.length,
    errors: payload.errors.length
  };
}
