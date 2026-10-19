import type { Locator } from '@playwright/test'

// Picks an option from one of the console's dropdowns, as a user would: open
// it, then click the option by its label.
export async function choose(select: Locator, label: string): Promise<void> {
  await select.click()
  await select.page().getByRole('option', { name: label, exact: true }).click()
}
