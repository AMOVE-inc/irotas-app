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
var COMMUNITY_FILE_NAME = "_irotas_community_restaurants.json";

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
    description: text(row.Description) || undefined,
    memberComment: text(row.Note) || undefined,
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

function readJsonFile(folder, filename, fallback) {
  var files = folder.getFilesByName(filename);
  if (!files.hasNext()) return fallback;
  try {
    return JSON.parse(files.next().getBlob().getDataAsString("UTF-8"));
  } catch (error) {
    return fallback;
  }
}

function writeJsonFile(folder, filename, value) {
  var files = folder.getFilesByName(filename);
  var json = JSON.stringify(value);
  if (files.hasNext()) files.next().setContent(json);
  else folder.createFile(filename, json, MimeType.PLAIN_TEXT);
}

function communityRestaurant(record) {
  var submission = record.submission;
  var place = record.place || {};
  var location = place.location || {};
  var placeId = text(place.id);
  var fallbackId = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, submission.googleMapsUrl)).slice(0, 32);
  return {
    id: "community_" + (placeId || fallbackId),
    placeId: placeId || undefined,
    name: text(place.displayName && place.displayName.text) || submission.restaurantName,
    genre: "メンバー高評価店",
    sourceCategories: ["メンバー高評価店"],
    address: text(place.formattedAddress) || submission.area,
    latitude: numberValue(location.latitude),
    longitude: numberValue(location.longitude),
    rating: numberValue(place.rating) || submission.memberRating,
    reviewCount: numberValue(place.userRatingCount),
    image: submission.image || "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?w=800",
    googleMapsUrl: text(place.googleMapsUri) || submission.googleMapsUrl,
    price: submission.budget || undefined,
    sourceList: "メンバー高評価店",
    importedAt: record.updatedAt,
    sourceType: "meal_report",
    sourceThreadId: submission.reportId,
    sourceThreadTitle: submission.reportTitle,
    memberRating: submission.memberRating
  };
}

function mergeCommunityRestaurants(folder, payload) {
  var records = readJsonFile(folder, COMMUNITY_FILE_NAME, []);
  records.filter(function (record) { return record.published !== false; }).forEach(function (record) {
    var restaurant = communityRestaurant(record);
    var existingIndex = payload.restaurants.findIndex(function (item) {
      return (restaurant.placeId && item.placeId === restaurant.placeId) || item.googleMapsUrl === restaurant.googleMapsUrl;
    });
    if (existingIndex >= 0) payload.restaurants[existingIndex] = Object.assign({}, payload.restaurants[existingIndex], restaurant);
    else payload.restaurants.push(restaurant);
  });
  return payload;
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
    var csvText = file.getBlob().getDataAsString("UTF-8").replace(/^\uFEFF/, "");
    var values = Utilities.parseCsv(csvText);
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
  mergeCommunityRestaurants(folder, payload);
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

function doPost(event) {
  var folder = DriveApp.getFolderById(GOURMET_MAP_FOLDER_ID);
  var request = JSON.parse(event.postData.contents || "{}");
  var action = request.action;
  var payload = request.payload || {};
  var records = readJsonFile(folder, COMMUNITY_FILE_NAME, []);

  if (action === "upsertMealReport") {
    var submission = payload;
    var place = payload.place || null;
    delete submission.place;
    var matchIndex = records.findIndex(function (record) {
      return record.submission.reportId === submission.reportId ||
        (place && place.id && record.place && record.place.id === place.id) ||
        record.submission.googleMapsUrl === submission.googleMapsUrl;
    });
    var record = {
      id: matchIndex >= 0 ? records[matchIndex].id : "meal_" + Utilities.getUuid(),
      submission: submission,
      place: place,
      published: true,
      updatedAt: new Date().toISOString()
    };
    if (matchIndex >= 0) records[matchIndex] = record;
    else records.push(record);
    writeJsonFile(folder, COMMUNITY_FILE_NAME, records);
    rebuildGourmetMapFeed();
    return ContentService.createTextOutput(JSON.stringify({ success: true, duplicate: matchIndex >= 0 })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "setPublished") {
    var changed = false;
    records.forEach(function (record) {
      if (communityRestaurant(record).id === payload.id) {
        record.published = payload.published;
        record.updatedAt = new Date().toISOString();
        changed = true;
      }
    });
    if (!changed) return ContentService.createTextOutput(JSON.stringify({ success: false })).setMimeType(ContentService.MimeType.JSON);
    writeJsonFile(folder, COMMUNITY_FILE_NAME, records);
    rebuildGourmetMapFeed();
    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ success: false })).setMimeType(ContentService.MimeType.JSON);
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
