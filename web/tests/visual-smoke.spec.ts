import { expect, test } from "@playwright/test";

test("sign-in route renders branded entry", async ({ page }) => {
  await page.goto("/auth/signin");
  await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Sign in with Google|Signing in/ }),
  ).toBeVisible();
});

test("offline route renders recovery link", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
});

test("missing shared route renders branded fallback", async ({ page }) => {
  await page.goto("/s/not-a-real-token");
  await expect(page.getByRole("heading", { name: "Shared plan not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Atlas" })).toBeVisible();
});
