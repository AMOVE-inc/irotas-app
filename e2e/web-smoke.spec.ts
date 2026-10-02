import { expect, test } from "@playwright/test";

async function enterMemberApplication(page: import("@playwright/test").Page) {
  await page.goto("/login");
  const branchHeading = page.getByText("所属する支部を選択", { exact: true });
  if (await branchHeading.isVisible()) {
    const kanto = page.getByRole("checkbox", { name: "関東支部" });
    await kanto.click();
    await expect(kanto).toHaveAttribute("aria-checked", "true");
    await page.getByText("選択した支部で始める", { exact: true }).click();
  }
  await expect(page.getByRole("tab", { name: "ホーム" })).toBeVisible();
}

test("preview authentication reaches the member application", async ({ page }) => {
  await enterMemberApplication(page);
  await expect(page.getByRole("tab", { name: "イベント" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "掲示板" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "チャット" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "マイページ" })).toBeVisible();
});

test("preview authentication survives a full page reload", async ({ page }) => {
  await enterMemberApplication(page);
  await page.reload();
  await expect(page.getByRole("tab", { name: "ホーム" })).toBeVisible();
  await expect(page).not.toHaveURL(/login|select-branch/);
});

test("the primary tab routes remain connected", async ({ page }) => {
  await enterMemberApplication(page);
  await page.getByRole("tab", { name: "イベント" }).click();
  await expect(page).toHaveURL(/events/);
  await page.getByRole("tab", { name: "掲示板" }).click();
  await expect(page).toHaveURL(/board/);
  await page.getByRole("tab", { name: "チャット" }).click();
  await expect(page).toHaveURL(/chats|chat-list|chat/);
  await page.getByRole("tab", { name: "マイページ" }).click();
  await expect(page).toHaveURL(/profile/);
});

test("member directory route exposes searchable controls", async ({ page }) => {
  await enterMemberApplication(page);
  await page.goto("/members");
  await expect(page.getByText("メンバー検索", { exact: true })).toBeVisible();
  const search = page.getByPlaceholder("名前またはユーザーIDで検索");
  await search.fill("aoi");
  await expect(search).toHaveValue("aoi");
  await expect(page).not.toHaveURL(/login|select-branch/);
});

test("rapid repeated navigation keeps every selected tab stable", async ({ page }) => {
  await enterMemberApplication(page);
  const routes = [
    { name: "イベント", path: /events/ },
    { name: "掲示板", path: /board/ },
    { name: "チャット", path: /chats/ },
    { name: "マイページ", path: /profile/ },
    { name: "ホーム", path: /\/($|\?)/ },
  ];

  for (const route of routes) {
    const tab = page.getByRole("tab", { name: route.name });
    await Promise.all(Array.from({ length: 5 }, () => tab.click()));
    await expect(page).toHaveURL(route.path);
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
});
