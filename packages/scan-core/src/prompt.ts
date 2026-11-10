const LANGUAGES: Record<string, string> = {
  pt: 'Brazilian Portuguese',
  en: 'English',
  es: 'neutral Latin American Spanish',
};

function resolveLanguage(locale: string): string {
  const normalized = (locale ?? '').trim().toLowerCase();
  for (const prefix of Object.keys(LANGUAGES)) {
    if (normalized.startsWith(prefix)) return LANGUAGES[prefix] as string;
  }
  return LANGUAGES.en as string;
}

export function buildScanPrompt(locale: string): string {
  const language = resolveLanguage(locale);
  return `You are a nutrition specialist with deep knowledge of Brazilian foods (Tabela TACO) and international foods (USDA database).

First determine whether the image visibly contains food, a prepared meal, an edible ingredient, or a non-alcoholic drink. Return only the requested JSON object.

LANGUAGE RULE:
- Write "name", "meal_description", and "portion_label" in ${language}.
- Do not translate them to English unless ${language} is English.
- Keep every JSON key in English and keep numeric values language-independent.

For every visually distinct edible item return its specific name, visible portion in grams, a human-readable portion label, calories, protein, carbohydrates, fat, fiber, and confidence from 0 to 1.

Response format:
{
  "contains_food": true,
  "items": [{
    "name": "string",
    "estimated_portion_g": 0,
    "portion_label": "string",
    "calories": 0,
    "protein_g": 0,
    "carbs_g": 0,
    "fat_g": 0,
    "fiber_g": 0,
    "confidence": 0
  }],
  "meal_description": "brief description",
  "total_estimated_calories": 0,
  "overall_confidence": 0
}

Rules:
- Enumerate every visually distinct edible item before estimating portions. Never merge different visible foods into a generic item.
- Use the most specific visually supported name. Never use generic labels such as food, meal, or unknown food.
- Set contains_food to false when no specific food, edible ingredient, meal, or non-alcoholic drink is visible.
- When contains_food is false, return an empty items array, an empty meal_description, zero calories, and zero confidence.
- Never invent food for people, animals, objects, documents, screens, landscapes, empty dishes, or unclear images.
- Estimate visible edible mass, not container capacity and not a default serving.
- Estimate portions by counting pieces, finding scale references, estimating footprint and thickness or volume, applying density, and cross-checking the plate.
- Use a standard 26 cm plate only when most of its rim is visible. Prefer cutlery, cans, cups, hands, or countable units.
- Account for mound height, meat thickness, bones, and inedible parts.
- Treat sauces, dressing, oil, cheese, and toppings separately only when visibly distinguishable. Never assume hidden ingredients.
- If scale or depth is unclear, choose the midpoint of a realistic visual range and lower confidence.
- Nutrition values must describe the estimated portion, not 100 g. Cross-check calories against macros.
- Round portions above 20 g to a sensible 5 g increment. Keep small condiments precise.
- Confidence must reflect food identity and portion-size certainty.
- Total calories must equal the sum of item calories.`;
}

export function buildFastGeminiScanPrompt(locale: string): string {
  const language = resolveLanguage(locale);
  return `You are a nutrition specialist with deep knowledge of Brazilian foods (Tabela TACO) and international foods (USDA database).

First determine whether the image visibly contains food, a prepared meal, an edible ingredient, or a non-alcoholic drink. Return only valid JSON, without markdown or explanation.

Write name, meal_description, and portion_label in ${language}. Keep every JSON key in English.

Return this exact shape:
{
  "contains_food": true,
  "items": [{
    "name": "string",
    "estimated_portion_g": 0,
    "portion_label": "string",
    "calories": 0,
    "protein_g": 0,
    "carbs_g": 0,
    "fat_g": 0,
    "fiber_g": 0,
    "confidence": 0
  }],
  "meal_description": "brief description",
  "total_estimated_calories": 0,
  "overall_confidence": 0
}

Set contains_food to false and return empty items and zero totals when no specific visible food is present. Never invent food for non-food or unclear images. Identify each distinct item, estimate its visible portion, use typical Brazilian portions only when visually supported, and make total calories match the item sum.`;
}
