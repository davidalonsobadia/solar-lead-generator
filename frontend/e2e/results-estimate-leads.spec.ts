import { expect, test } from "@playwright/test"

// Happy path for the core flow: Results -> open a property -> generate an
// estimate (Google Solar mocked) -> adjust a slider -> Leads -> export CSV.
//
// All backend traffic is served by e2e/mock-backend.mjs, so this never reaches
// the real Google Solar API. There is no in-app link from a Results card to a
// property today, so navigation between screens uses the canonical routes
// directly; the meaningful interactions (estimate creation, slider recalc, CSV
// export) all exercise the (mocked) network round-trips.
const PROPERTY_ID = 1

test("Results -> Estimate -> Leads core flow", async ({ page }) => {
  // 1. Results: the property grid loads from the backend.
  await page.goto("/results")
  await expect(
    page.getByRole("heading", { name: "Results", level: 1 }),
  ).toBeVisible()
  await expect(page.getByText("Acme Manufacturing").first()).toBeVisible()

  // 2. Open the property's estimate. With no estimate yet, the inputs panel
  //    bootstraps one via POST (the mocked Solar lookup).
  const createResponse = page.waitForResponse(
    (res) =>
      res.url().includes(`/api/properties/${PROPERTY_ID}/estimate`) &&
      res.request().method() === "POST",
  )
  await page.goto(`/properties/${PROPERTY_ID}/estimate`)
  await expect(
    page.getByRole("heading", { name: "Estimate", level: 1 }),
  ).toBeVisible()
  await createResponse
  await expect(page.getByText("All changes saved").first()).toBeVisible()

  // 3. Reload so the now-persisted estimate enables the adjust sliders, then
  //    move one — each change recalculates via PUT (no new Solar lookup).
  await page.reload()
  const shadingThumb = page.locator('#adjust-shading [role="slider"]')
  await expect(shadingThumb).toBeEnabled()

  const recalcResponse = page.waitForResponse(
    (res) =>
      res.url().includes("/api/estimates/1") &&
      res.request().method() === "PUT",
  )
  await shadingThumb.focus()
  await page.keyboard.press("ArrowRight")
  await recalcResponse
  await expect(page.getByText("All changes saved").first()).toBeVisible()

  // 4. Leads: the decision-makers table loads for the property.
  await page.goto(`/properties/${PROPERTY_ID}/leads`)
  await expect(
    page.getByRole("heading", { name: "Generate Leads", level: 1 }),
  ).toBeVisible()
  await expect(page.getByText("Jordan Rivera")).toBeVisible()
  await expect(page.getByText("Sam Okafor")).toBeVisible()

  // 5. Export the leads as CSV and confirm the download is triggered.
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export CSV" }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(
    `property-${PROPERTY_ID}-leads.csv`,
  )
})
