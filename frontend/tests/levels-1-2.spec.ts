import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? 'superadmin@pcdav.local';
const password = process.env.E2E_PASSWORD ?? 'ChangeMe123!Long';

test.describe('Levels 1–3 staff workflows', () => {
  test('signs in and renders the role-aware dashboard', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in securely' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('PCDAV ERP').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Good morning' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Students' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users & roles' })).toBeVisible();
  });

  test('searches the registry and opens Student 360', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Students' }).click();
    await expect(page.getByRole('heading', { name: 'Student registry' })).toBeVisible();
    await page.getByPlaceholder('Admission number, student name…').fill('PDAV-0001');
    await page.getByRole('button', { name: 'Search registry' }).click();
    await expect(page.getByText('PDAV-0001')).toBeVisible();
    await page.getByRole('link', { name: 'Open 360 →' }).click();
    await expect(page).toHaveURL(/\/students\/.+/, { timeout: 15_000 });
    await expect(page.getByText('Primary school identifier')).toBeVisible();
  });

  test('opens admissions, academic setup, and audit screens', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Admissions' }).click();
    await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible();
    await page.getByRole('link', { name: 'Academic setup' }).click();
    await expect(page.getByRole('heading', { name: 'Academic setup' })).toBeVisible();
    await page.getByRole('link', { name: 'Audit history' }).click();
    await expect(page.getByRole('heading', { name: 'Audit history' })).toBeVisible();
  });

  test('loads the Level 3 fee, ledger, and service workspaces through the same-origin API', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Fee plans' }).click();
    await expect(page.getByRole('heading', { name: 'Fee plans' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fee heads' })).toBeVisible();
    await page.getByRole('link', { name: 'Fee ledger' }).click();
    await expect(page.getByRole('heading', { name: 'Student fee ledger' })).toBeVisible();
    await page.getByPlaceholder('Search by admission number or name').fill('PDAV-0001');
    await page.getByRole('button', { name: 'Find student' }).click();
    await expect(page.getByText('PDAV-0001')).toBeVisible();
    await page.getByRole('link', { name: 'Transport & hostel' }).click();
    await expect(page.getByRole('heading', { name: 'Transport & hostel assignments' })).toBeVisible();
  });

  test('loads transport and store management workspaces', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Transport management' }).click();
    await expect(page.getByRole('heading', { name: 'Routes, vehicles & student allocation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Route master' })).toBeVisible();
    await page.getByRole('link', { name: 'Store management' }).click();
    await expect(page.getByRole('heading', { name: 'Inventory, student issues & balances' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Store masters' })).toBeVisible();
  });

  test('keeps the main staff workflows usable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Good morning' })).toBeVisible();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Students' })).toBeVisible();
    await page.getByRole('link', { name: 'Students' }).click();
    await expect(page.getByRole('heading', { name: 'Student registry' })).toBeVisible();
    await expect(page.getByPlaceholder('Admission number, student name…')).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
});

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
